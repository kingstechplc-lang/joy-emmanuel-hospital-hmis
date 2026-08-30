// Script to generate certification API routes
const fs = require('fs');
const path = require('path');
const baseDir = '/home/z/my-project/src/app/api';
const routes = [];

// ---- CERTIFICATION TYPES ----
routes.push(['certification-types/route.ts', `// API: /api/certification-types — GET + POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const items = await db.certificationType.findMany({
    where: { organizationId: session.user.organizationId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, code, category, credentialType, description, isMandatory, defaultValidityMonths, requiresVerification, requiresApproval, allowsExpiry } = body;
  if (!name || !code) return NextResponse.json({ error: "name, code are required" }, { status: 400 });
  const existing = await db.certificationType.findUnique({ where: { organizationId_code: { organizationId: session.user.organizationId, code } } });
  if (existing) return NextResponse.json({ error: "Code already exists" }, { status: 409 });
  const item = await db.certificationType.create({
    data: {
      organizationId: session.user.organizationId,
      name, code, category: category || null,
      credentialType: credentialType || "certification",
      description, isMandatory: !!isMandatory,
      defaultValidityMonths: defaultValidityMonths ? parseInt(defaultValidityMonths, 10) : null,
      requiresVerification: requiresVerification !== false,
      requiresApproval: requiresApproval !== false,
      allowsExpiry: allowsExpiry !== false,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_TYPE_CREATED", resourceType: "certification_type", resourceId: item.id, newValues: { name, code } });
  return NextResponse.json({ item }, { status: 201 });
}
`]);

routes.push(['certification-types/[id]/route.ts', `// API: /api/certification-types/[id] — GET / PATCH / DELETE
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.certificationType.findUnique({ where: { id } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.certificationType.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.certificationType.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_TYPE_UPDATED", resourceType: "certification_type", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.certificationType.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.certificationType.update({ where: { id }, data: { active: false } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_TYPE_DEACTIVATED", resourceType: "certification_type", resourceId: id });
  return NextResponse.json({ ok: true });
}
`]);

// ---- CERTIFICATION ISSUERS ----
routes.push(['certification-issuers/route.ts', `// API: /api/certification-issuers — GET + POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const items = await db.certificationIssuer.findMany({
    where: { organizationId: session.user.organizationId, active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_ISSUER_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, type, country, contactPerson, email, phone, website, address, accreditation, verificationUrl, notes } = body;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const item = await db.certificationIssuer.create({
    data: {
      organizationId: session.user.organizationId,
      name, type: type || null, country: country || null,
      contactPerson: contactPerson || null, email: email || null, phone: phone || null,
      website: website || null, address: address || null,
      accreditation: accreditation || null, verificationUrl: verificationUrl || null, notes: notes || null,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_ISSUER_CREATED", resourceType: "certification_issuer", resourceId: item.id, newValues: { name } });
  return NextResponse.json({ item }, { status: 201 });
}
`]);

routes.push(['certification-issuers/[id]/route.ts', `// API: /api/certification-issuers/[id] — GET / PATCH / DELETE
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.certificationIssuer.findUnique({ where: { id } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_ISSUER_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.certificationIssuer.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.certificationIssuer.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_ISSUER_UPDATED", resourceType: "certification_issuer", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_ISSUER_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.certificationIssuer.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.certificationIssuer.update({ where: { id }, data: { active: false } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_ISSUER_DEACTIVATED", resourceType: "certification_issuer", resourceId: id });
  return NextResponse.json({ ok: true });
}
`]);

// ---- CERTIFICATION REQUIREMENTS ----
routes.push(['certification-requirements/route.ts', `// API: /api/certification-requirements — GET + POST
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const departmentId = url.searchParams.get("departmentId");
  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  const items = await db.certificationRequirement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } }, certificationType: true },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { facilityId, departmentId, certificationTypeId, certificationName, profession, specialty, jobRole, employmentType, staffCategory, isMandatory, validityMonths } = body;
  if (!certificationName) return NextResponse.json({ error: "certificationName is required" }, { status: 400 });
  const item = await db.certificationRequirement.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null, departmentId: departmentId || null,
      certificationTypeId: certificationTypeId || null,
      certificationName, profession: profession || null, specialty: specialty || null,
      jobRole: jobRole || null, employmentType: employmentType || null, staffCategory: staffCategory || null,
      isMandatory: isMandatory !== false,
      validityMonths: validityMonths ? parseInt(validityMonths, 10) : null,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_REQUIREMENT_CREATED", resourceType: "certification_requirement", resourceId: item.id, newValues: { certificationName, isMandatory } });
  return NextResponse.json({ item }, { status: 201 });
}
`]);

routes.push(['certification-requirements/[id]/route.ts', `// API: /api/certification-requirements/[id] — GET / PATCH / DELETE
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.certificationRequirement.findUnique({ where: { id }, include: { facility: true, department: true, certificationType: true } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.certificationRequirement.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.certificationRequirement.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_REQUIREMENT_UPDATED", resourceType: "certification_requirement", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.certificationRequirement.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.certificationRequirement.delete({ where: { id } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "CERTIFICATION_REQUIREMENT_DELETED", resourceType: "certification_requirement", resourceId: id });
  return NextResponse.json({ ok: true });
}
`]);

// Write all routes
for (const [relPath, content] of routes) {
  const fullPath = path.join(baseDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  console.log('Wrote:', relPath);
}
console.log('Total: ' + routes.length + ' routes written');

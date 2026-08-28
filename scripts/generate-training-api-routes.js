// Script to generate all training API routes programmatically
const fs = require('fs');
const path = require('path');
const baseDir = '/home/z/my-project/src/app/api';
const routes = [];

// Helper to generate a standard CRUD route file
function crudRoute(entityName, modelName, permView, permManage, includeRelations, extraFields) {
  const include = includeRelations || '';
  return `// API: /api/${entityName} — GET (list) + POST (create)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.${permView}) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const status = url.searchParams.get("status");
  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.facilityId = facilityId;
  if (status) where.status = status;
  const items = await db.${modelName}.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,${include ? `\n    include: ${include},` : ''}
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.${permManage}) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  body.organizationId = session.user.organizationId;
  const item = await db.${modelName}.create({ data: body });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "${entityName.toUpperCase().replace(/-/g, '_')}_CREATED", resourceType: "${modelName}", resourceId: item.id, newValues: body });
  return NextResponse.json({ item }, { status: 201 });
}
`;
}

function crudIdRoute(entityName, modelName, permView, permManage, includeRelations) {
  const include = includeRelations || '';
  return `// API: /api/${entityName}/[id] — GET / PATCH / DELETE
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.${permView}) && !hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.${modelName}.findUnique({ where: { id }${include ? `, include: ${include}` : ''} });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.${permManage}) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.${modelName}.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  delete body.id;
  delete body.organizationId;
  const updated = await db.${modelName}.update({ where: { id }, data: body });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "${entityName.toUpperCase().replace(/-/g, '_')}_UPDATED", resourceType: "${modelName}", resourceId: id, oldValues: existing, newValues: body });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.${permManage}) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.${modelName}.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Soft delete — deactivate instead of deleting
  try { await db.${modelName}.update({ where: { id }, data: { status: "archived" } }); } catch { await db.${modelName}.delete({ where: { id } }); }
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "${entityName.toUpperCase().replace(/-/g, '_')}_DELETED", resourceType: "${modelName}", resourceId: id });
  return NextResponse.json({ ok: true });
}
`;
}

// Generate routes for each entity
const entities = [
  { dir: 'training-providers', model: 'trainingProvider', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_MANAGE', include: '{ facility: { select: { id: true, name: true } } }' },
  { dir: 'trainers', model: 'trainer', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_MANAGE', include: '{ staff: { select: { id: true, firstName: true, lastName: true, staffNumber: true } } }' },
  { dir: 'training-sessions', model: 'trainingSession', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_MANAGE', include: '{ program: true, facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } }, trainer: true, _count: { select: { enrollments: true } } }' },
  { dir: 'training-enrollments', model: 'trainingEnrollment', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_ENROLL', include: '{ staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } }, program: { select: { id: true, title: true } }, session: { select: { id: true, sessionDate: true, startTime: true, endTime: true } } }' },
  { dir: 'training-assessments', model: 'trainingAssessment', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_ASSESSMENT_MANAGE', include: '{ program: { select: { id: true, title: true } } }' },
  { dir: 'training-assessment-results', model: 'trainingAssessmentResult', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_ASSESSMENT_MANAGE', include: '{ assessment: true, staff: { select: { id: true, firstName: true, lastName: true, staffNumber: true } }, assessor: { select: { id: true, firstName: true, lastName: true } } }' },
  { dir: 'training-requirements', model: 'trainingRequirement', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_REQUIREMENT_MANAGE', include: '{ facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } }, program: { select: { id: true, title: true } } }' },
  { dir: 'training-plans', model: 'trainingPlan', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_MANAGE', include: '{ facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } }, program: { select: { id: true, title: true } } }' },
  { dir: 'training-evaluations', model: 'trainingEvaluation', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_MANAGE', include: '{ program: { select: { id: true, title: true } }, staff: { select: { id: true, firstName: true, lastName: true } } }' },
  { dir: 'training-competencies', model: 'trainingCompetency', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_COMPETENCY_MANAGE', include: '{ _count: { select: { staffCompetencies: true } } }' },
  { dir: 'staff-competencies', model: 'staffCompetency', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_COMPETENCY_MANAGE', include: '{ staff: { select: { id: true, firstName: true, lastName: true, staffNumber: true } }, competency: true, assessor: { select: { id: true, firstName: true, lastName: true } } }' },
  { dir: 'cpd-records', model: 'cPDRecord', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_CPD_MANAGE', include: '{ staff: { select: { id: true, firstName: true, lastName: true, staffNumber: true } } }' },
  { dir: 'external-training', model: 'externalTrainingRecord', viewPerm: 'TRAINING_VIEW', managePerm: 'TRAINING_MANAGE', include: '{ staff: { select: { id: true, firstName: true, lastName: true, staffNumber: true } }, provider: { select: { id: true, name: true } } }' },
];

for (const e of entities) {
  routes.push([`${e.dir}/route.ts`, crudRoute(e.dir, e.model, e.viewPerm, e.managePerm, e.include)]);
  routes.push([`${e.dir}/[id]/route.ts`, crudIdRoute(e.dir, e.model, e.viewPerm, e.managePerm, e.include)]);
}

// Write all routes
for (const [relPath, content] of routes) {
  const fullPath = path.join(baseDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  console.log('Wrote:', relPath);
}
console.log('Total: ' + routes.length + ' routes written');

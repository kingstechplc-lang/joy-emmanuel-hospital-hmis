// Script to generate all the workforce API routes programmatically
// This avoids manually writing 30+ very similar route files
const fs = require('fs');
const path = require('path');

const baseDir = '/home/z/my-project/src/app/api';

// Routes are defined as [dirPath, content] pairs
const routes = [];

// ---------- SHIFT TEMPLATES ----------
routes.push([
  'shift-templates/route.ts',
  `// API: /api/shift-templates — GET (list) + POST (create)
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
  const items = await db.shiftTemplate.findMany({
    where,
    orderBy: [{ name: "asc" }],
    include: { shiftType: true, facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, code, shiftTypeId, facilityId, departmentId, startTime, endTime, breakMinutes, paidBreak, overnight, isOnCall, category, workingHours, minStaff, requiredSkillMix, description } = body;
  if (!name || !code || !startTime || !endTime) return NextResponse.json({ error: "name, code, startTime, endTime are required" }, { status: 400 });
  const existing = await db.shiftTemplate.findUnique({ where: { organizationId_code: { organizationId: session.user.organizationId, code } } });
  if (existing) return NextResponse.json({ error: "Code already exists" }, { status: 409 });
  const item = await db.shiftTemplate.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      departmentId: departmentId || null,
      name, code,
      shiftTypeId: shiftTypeId || null,
      startTime, endTime,
      breakMinutes: breakMinutes || 0,
      paidBreak: paidBreak !== false,
      overnight: !!overnight,
      isOnCall: !!isOnCall,
      category: category || "regular",
      workingHours,
      minStaff,
      requiredSkillMix: requiredSkillMix ? JSON.stringify(requiredSkillMix) : null,
      description,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "SHIFT_TEMPLATE_CREATED", resourceType: "shift_template", resourceId: item.id, newValues: { name, code } });
  return NextResponse.json({ item }, { status: 201 });
}
`,
]);

routes.push([
  'shift-templates/[id]/route.ts',
  `// API: /api/shift-templates/[id] — GET / PATCH / DELETE
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
  const item = await db.shiftTemplate.findUnique({ where: { id }, include: { shiftType: true } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.shiftTemplate.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, code, shiftTypeId, facilityId, departmentId, startTime, endTime, breakMinutes, paidBreak, overnight, isOnCall, category, workingHours, minStaff, requiredSkillMix, description, active } = body;
  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (code !== undefined) updateData.code = code;
  if (shiftTypeId !== undefined) updateData.shiftTypeId = shiftTypeId || null;
  if (facilityId !== undefined) updateData.facilityId = facilityId || null;
  if (departmentId !== undefined) updateData.departmentId = departmentId || null;
  if (startTime !== undefined) updateData.startTime = startTime;
  if (endTime !== undefined) updateData.endTime = endTime;
  if (breakMinutes !== undefined) updateData.breakMinutes = breakMinutes;
  if (paidBreak !== undefined) updateData.paidBreak = paidBreak;
  if (overnight !== undefined) updateData.overnight = overnight;
  if (isOnCall !== undefined) updateData.isOnCall = isOnCall;
  if (category !== undefined) updateData.category = category;
  if (workingHours !== undefined) updateData.workingHours = workingHours;
  if (minStaff !== undefined) updateData.minStaff = minStaff;
  if (requiredSkillMix !== undefined) updateData.requiredSkillMix = requiredSkillMix ? JSON.stringify(requiredSkillMix) : null;
  if (description !== undefined) updateData.description = description;
  if (active !== undefined) updateData.active = active;
  const updated = await db.shiftTemplate.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "SHIFT_TEMPLATE_UPDATED", resourceType: "shift_template", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.shiftTemplate.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.shiftTemplate.update({ where: { id }, data: { active: false } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "SHIFT_TEMPLATE_DEACTIVATED", resourceType: "shift_template", resourceId: id });
  return NextResponse.json({ ok: true });
}
`,
]);

// ---------- LEAVE TYPES ----------
routes.push([
  'leave-types/route.ts',
  `// API: /api/leave-types — GET (list) + POST (create)
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
  const where: any = { organizationId: session.user.organizationId };
  if (facilityId) where.OR = [{ facilityId: null }, { facilityId }];
  const items = await db.leaveType.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, code, category, colorHex, defaultDays, accrualRatePerMonth, carryForwardLimit, carryForwardExpiryMonths, minDurationDays, maxDurationDays, noticePeriodDays, requiresDocumentation, requiresApprovalHierarchy, isSensitive, description, facilityId, sortOrder } = body;
  if (!name || !code) return NextResponse.json({ error: "name, code are required" }, { status: 400 });
  const existing = await db.leaveType.findUnique({ where: { organizationId_code: { organizationId: session.user.organizationId, code } } });
  if (existing) return NextResponse.json({ error: "Code already exists" }, { status: 409 });
  const item = await db.leaveType.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      name, code,
      category: category || "paid",
      colorHex,
      defaultDays,
      accrualRatePerMonth,
      carryForwardLimit,
      carryForwardExpiryMonths,
      minDurationDays: minDurationDays || 1,
      maxDurationDays,
      noticePeriodDays,
      requiresDocumentation: !!requiresDocumentation,
      requiresApprovalHierarchy: requiresApprovalHierarchy !== false,
      isSensitive: !!isSensitive,
      description,
      sortOrder: sortOrder || 0,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "LEAVE_TYPE_CREATED", resourceType: "leave_type", resourceId: item.id, newValues: { name, code } });
  return NextResponse.json({ item }, { status: 201 });
}
`,
]);

routes.push([
  'leave-types/[id]/route.ts',
  `// API: /api/leave-types/[id] — GET / PATCH / DELETE
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
  const item = await db.leaveType.findUnique({ where: { id } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.leaveType.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.leaveType.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "LEAVE_TYPE_UPDATED", resourceType: "leave_type", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.leaveType.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.leaveType.update({ where: { id }, data: { active: false } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "LEAVE_TYPE_DEACTIVATED", resourceType: "leave_type", resourceId: id });
  return NextResponse.json({ ok: true });
}
`,
]);

// ---------- HOLIDAYS ----------
routes.push([
  'holidays/route.ts',
  `// API: /api/holidays — GET (list) + POST (create)
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
  const year = url.searchParams.get("year");
  const where: any = { organizationId: session.user.organizationId, active: true };
  if (facilityId) where.OR = [{ facilityId: null }, { facilityId }];
  if (year) {
    const start = new Date(\`\${year}-01-01\`);
    const end = new Date(\`\${year}-12-31\`);
    where.date = { gte: start, lte: end };
  }
  const items = await db.holiday.findMany({ where, orderBy: { date: "asc" } });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.HOLIDAY_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, date, type, description, isRecurring, facilityId } = body;
  if (!name || !date) return NextResponse.json({ error: "name, date are required" }, { status: 400 });
  const item = await db.holiday.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: facilityId || null,
      name,
      date: new Date(date),
      type: type || "public",
      description,
      isRecurring: !!isRecurring,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "HOLIDAY_CREATED", resourceType: "holiday", resourceId: item.id, newValues: { name, date } });
  return NextResponse.json({ item }, { status: 201 });
}
`,
]);

routes.push([
  'holidays/[id]/route.ts',
  `// API: /api/holidays/[id] — GET / PATCH / DELETE
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
  const item = await db.holiday.findUnique({ where: { id } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.HOLIDAY_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.holiday.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  if (updateData.date) updateData.date = new Date(updateData.date);
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.holiday.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "HOLIDAY_UPDATED", resourceType: "holiday", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.HOLIDAY_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.holiday.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.holiday.delete({ where: { id } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "HOLIDAY_DELETED", resourceType: "holiday", resourceId: id });
  return NextResponse.json({ ok: true });
}
`,
]);

// ---------- LEAVE POLICIES ----------
routes.push([
  'leave-policies/route.ts',
  `// API: /api/leave-policies — GET (list) + POST (create)
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
  const leaveTypeId = url.searchParams.get("leaveTypeId");
  const where: any = { organizationId: session.user.organizationId };
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;
  const items = await db.leavePolicy.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { leaveType: true, facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_POLICY_MANAGE) && !hasPermission(session, PERMISSIONS.LEAVE_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, leaveTypeId, facilityId, departmentId, eligibilityRules, approvalHierarchy, accrualFrequency, accrualAmount, carryForwardEnabled, carryForwardLimit, carryForwardExpiryMonths, negativeBalanceAllowed, negativeBalanceLimit, effectiveFrom, effectiveTo, notes } = body;
  if (!name || !leaveTypeId) return NextResponse.json({ error: "name, leaveTypeId are required" }, { status: 400 });
  const lt = await db.leaveType.findUnique({ where: { id: leaveTypeId } });
  if (!lt || lt.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid leave type" }, { status: 400 });
  const item = await db.leavePolicy.create({
    data: {
      organizationId: session.user.organizationId,
      leaveTypeId,
      facilityId: facilityId || null,
      departmentId: departmentId || null,
      name,
      eligibilityRules: eligibilityRules ? JSON.stringify(eligibilityRules) : null,
      approvalHierarchy: approvalHierarchy ? JSON.stringify(approvalHierarchy) : null,
      accrualFrequency,
      accrualAmount,
      carryForwardEnabled: !!carryForwardEnabled,
      carryForwardLimit,
      carryForwardExpiryMonths,
      negativeBalanceAllowed: !!negativeBalanceAllowed,
      negativeBalanceLimit: negativeBalanceLimit || 0,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null,
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      notes,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "LEAVE_POLICY_CREATED", resourceType: "leave_policy", resourceId: item.id, newValues: { name, leaveTypeId } });
  return NextResponse.json({ item }, { status: 201 });
}
`,
]);

routes.push([
  'leave-policies/[id]/route.ts',
  `// API: /api/leave-policies/[id] — GET / PATCH / DELETE
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
  const item = await db.leavePolicy.findUnique({ where: { id }, include: { leaveType: true } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_POLICY_MANAGE) && !hasPermission(session, PERMISSIONS.LEAVE_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.leavePolicy.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  if (updateData.eligibilityRules) updateData.eligibilityRules = JSON.stringify(updateData.eligibilityRules);
  if (updateData.approvalHierarchy) updateData.approvalHierarchy = JSON.stringify(updateData.approvalHierarchy);
  if (updateData.effectiveFrom) updateData.effectiveFrom = new Date(updateData.effectiveFrom);
  if (updateData.effectiveTo) updateData.effectiveTo = new Date(updateData.effectiveTo);
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.leavePolicy.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "LEAVE_POLICY_UPDATED", resourceType: "leave_policy", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_POLICY_MANAGE) && !hasPermission(session, PERMISSIONS.LEAVE_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.leavePolicy.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.leavePolicy.update({ where: { id }, data: { active: false } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "LEAVE_POLICY_DEACTIVATED", resourceType: "leave_policy", resourceId: id });
  return NextResponse.json({ ok: true });
}
`,
]);

// ---------- STAFFING REQUIREMENTS ----------
routes.push([
  'staffing-requirements/route.ts',
  `// API: /api/staffing-requirements — GET (list) + POST (create)
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
  const where: any = { organizationId: session.user.organizationId, active: true };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  const items = await db.staffingRequirement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { facility: { select: { id: true, name: true } }, department: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFFING_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { facilityId, departmentId, wardId, shiftType, dayType, profession, specialty, seniority, minCount, idealCount, notes } = body;
  if (!facilityId || !minCount) return NextResponse.json({ error: "facilityId, minCount are required" }, { status: 400 });
  const fac = await db.facility.findUnique({ where: { id: facilityId } });
  if (!fac || fac.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  const item = await db.staffingRequirement.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId,
      departmentId: departmentId || null,
      wardId: wardId || null,
      shiftType: shiftType || null,
      dayType: dayType || "weekday",
      profession: profession || null,
      specialty: specialty || null,
      seniority: seniority || null,
      minCount: parseInt(minCount, 10) || 1,
      idealCount: idealCount ? parseInt(idealCount, 10) : null,
      notes,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "STAFFING_REQUIREMENT_CREATED", resourceType: "staffing_requirement", resourceId: item.id, newValues: { facilityId, profession, minCount } });
  return NextResponse.json({ item }, { status: 201 });
}
`,
]);

routes.push([
  'staffing-requirements/[id]/route.ts',
  `// API: /api/staffing-requirements/[id] — GET / PATCH / DELETE
import { NextResponse } from "next.server";
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
  const item = await db.staffingRequirement.findUnique({ where: { id } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFFING_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.staffingRequirement.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  if (updateData.minCount) updateData.minCount = parseInt(updateData.minCount, 10);
  if (updateData.idealCount) updateData.idealCount = parseInt(updateData.idealCount, 10);
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.staffingRequirement.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "STAFFING_REQUIREMENT_UPDATED", resourceType: "staffing_requirement", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFFING_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.staffingRequirement.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.staffingRequirement.update({ where: { id }, data: { active: false } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "STAFFING_REQUIREMENT_DEACTIVATED", resourceType: "staffing_requirement", resourceId: id });
  return NextResponse.json({ ok: true });
}
`,
]);

// ---------- STAFF AVAILABILITY ----------
routes.push([
  'staff-availability/route.ts',
  `// API: /api/staff-availability — GET (list) + POST (upsert)
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
  const staffId = url.searchParams.get("staffId");
  const facilityId = url.searchParams.get("facilityId");
  const date = url.searchParams.get("date");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const where: any = {};
  if (staffId) where.staffId = staffId;
  if (facilityId) where.facilityId = facilityId;
  if (date) where.date = new Date(date);
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo) where.date.lte = new Date(dateTo);
  }
  // Scope by org
  const orgStaff = await db.staff.findMany({
    where: { user: { organizationId: session.user.organizationId } },
    select: { id: true },
  });
  where.staffId = { in: [...orgStaff.map((s) => s.id), ...(staffId ? [staffId] : [])].filter((v, i, a) => a.indexOf(v) === i && (orgStaff.some((s) => s.id === v) || !!staffId && v === staffId)) };
  if (staffId && !orgStaff.some((s) => s.id === staffId)) {
    return NextResponse.json({ items: [], count: 0 });
  }
  const items = await db.staffAvailability.findMany({
    where,
    orderBy: { date: "desc" },
    take: 500,
    include: { staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } } },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_AVAILABILITY_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { staffId, facilityId, date, status, reason, notes } = body;
  if (!staffId || !date || !status) return NextResponse.json({ error: "staffId, date, status are required" }, { status: 400 });
  const item = await db.staffAvailability.upsert({
    where: { staffId_date: { staffId, date: new Date(date) } },
    update: { status, reason, notes, facilityId: facilityId || null },
    create: {
      staffId,
      facilityId: facilityId || null,
      date: new Date(date),
      status,
      reason,
      notes,
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "STAFF_AVAILABILITY_SET", resourceType: "staff_availability", resourceId: item.id, newValues: { staffId, date, status } });
  return NextResponse.json({ item }, { status: 201 });
}
`,
]);

routes.push([
  'staff-availability/[id]/route.ts',
  `// API: /api/staff-availability/[id] — GET / PATCH / DELETE
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
  const item = await db.staffAvailability.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_AVAILABILITY_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.staffAvailability.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  if (updateData.date) updateData.date = new Date(updateData.date);
  delete updateData.id;
  delete updateData.staffId;
  const updated = await db.staffAvailability.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "STAFF_AVAILABILITY_UPDATED", resourceType: "staff_availability", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_AVAILABILITY_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await db.staffAvailability.delete({ where: { id } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "STAFF_AVAILABILITY_DELETED", resourceType: "staff_availability", resourceId: id });
  return NextResponse.json({ ok: true });
}
`,
]);

// ---------- ON-CALL ----------
routes.push([
  'on-call/route.ts',
  `// API: /api/on-call — GET (list) + POST (create)
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
  const staffId = url.searchParams.get("staffId");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const status = url.searchParams.get("status");

  const orgFacilities = await db.facility.findMany({ where: { organizationId: session.user.organizationId }, select: { id: true } });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { facilityId: { in: orgFacilityIds } };
  if (facilityId) where.facilityId = facilityId;
  if (departmentId) where.departmentId = departmentId;
  if (staffId) where.staffId = staffId;
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.startDate = {};
    if (dateFrom) where.startDate.gte = new Date(dateFrom);
    if (dateTo) where.startDate.lte = new Date(dateTo);
  }

  const items = await db.onCallSchedule.findMany({
    where,
    orderBy: { startDate: "desc" },
    take: 500,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true, profession: true, phone: true } },
      facility: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });
  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ON_CALL_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { staffId, facilityId, departmentId, specialty, startDate, endDate, isPrimary, isBackup, contactMethod, contactValue, escalationOrder, notes } = body;
  if (!staffId || !facilityId || !startDate) return NextResponse.json({ error: "staffId, facilityId, startDate are required" }, { status: 400 });
  const fac = await db.facility.findUnique({ where: { id: facilityId } });
  if (!fac || fac.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  const item = await db.onCallSchedule.create({
    data: {
      organizationId: session.user.organizationId,
      staffId,
      facilityId,
      departmentId: departmentId || null,
      specialty,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      isPrimary: !!isPrimary,
      isBackup: !!isBackup,
      contactMethod,
      contactValue,
      escalationOrder: escalationOrder || 0,
      notes,
      status: "scheduled",
    },
  });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, facilityId, action: "ON_CALL_CREATED", resourceType: "on_call_schedule", resourceId: item.id, newValues: { staffId, facilityId, startDate } });
  return NextResponse.json({ item }, { status: 201 });
}
`,
]);

routes.push([
  'on-call/[id]/route.ts',
  `// API: /api/on-call/[id] — GET / PATCH / DELETE
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
  const item = await db.onCallSchedule.findUnique({ where: { id }, include: { staff: true, facility: true, department: true } });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ON_CALL_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.onCallSchedule.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const updateData: any = { ...body };
  if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
  if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);
  delete updateData.id;
  delete updateData.organizationId;
  const updated = await db.onCallSchedule.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ON_CALL_UPDATED", resourceType: "on_call_schedule", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.ON_CALL_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.onCallSchedule.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.onCallSchedule.update({ where: { id }, data: { status: "cancelled" } });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "ON_CALL_CANCELLED", resourceType: "on_call_schedule", resourceId: id });
  return NextResponse.json({ ok: true });
}
`,
]);

// ---------- LEAVE BALANCES ----------
routes.push([
  'leave-balances/route.ts',
  `// API: /api/leave-balances — GET (list staff balances)
import { NextResponse } from "next.server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const staffId = url.searchParams.get("staffId");
  const leaveTypeId = url.searchParams.get("leaveTypeId");
  const leaveYear = url.searchParams.get("leaveYear") || String(new Date().getFullYear());

  const orgStaff = await db.staff.findMany({
    where: { user: { organizationId: session.user.organizationId } },
    select: { id: true },
  });
  const orgStaffIds = orgStaff.map((s) => s.id);

  const where: any = { organizationId: session.user.organizationId, leaveYear, staffId: { in: orgStaffIds } };
  if (staffId) where.staffId = staffId;
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;

  const items = await db.leaveBalance.findMany({
    where,
    include: {
      staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true, professionalRole: true } },
      leaveType: { select: { id: true, name: true, code: true, colorHex: true } },
    },
    orderBy: [{ staff: { lastName: "asc" } }, { leaveType: { name: "asc" } }],
  });
  return NextResponse.json({ items, count: items.length, leaveYear });
}
`,
]);

routes.push([
  'leave-balances/[id]/route.ts',
  `// API: /api/leave-balances/[id] — GET / PATCH
import { NextResponse } from "next.server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { computeRemainingBalance } from "@/lib/shift-engine";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.STAFF_VIEW)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const item = await db.leaveBalance.findUnique({
    where: { id },
    include: { staff: { select: { id: true, staffNumber: true, firstName: true, lastName: true } }, leaveType: true, balanceAdjustments: { orderBy: { createdAt: "desc" }, take: 20, include: { authorizedBy: { select: { id: true, firstName: true, lastName: true } } } } },
  });
  if (!item || item.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const remaining = computeRemainingBalance(item);
  return NextResponse.json({ item: { ...item, computedRemaining: remaining } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_BALANCE_MANAGE) && !hasPermission(session, PERMISSIONS.LEAVE_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await db.leaveBalance.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { entitlement, accrued, carriedForward, carriedForwardExpiry, notes } = body;
  const updateData: any = {};
  if (entitlement !== undefined) updateData.entitlement = parseFloat(entitlement);
  if (accrued !== undefined) updateData.accrued = parseFloat(accrued);
  if (carriedForward !== undefined) updateData.carriedForward = parseFloat(carriedForward);
  if (carriedForwardExpiry !== undefined) updateData.carriedForwardExpiry = carriedForwardExpiry ? new Date(carriedForwardExpiry) : null;
  if (notes !== undefined) updateData.notes = notes;
  // Recompute remaining
  const merged = { ...existing, ...updateData };
  updateData.remaining = computeRemainingBalance(merged);
  const updated = await db.leaveBalance.update({ where: { id }, data: updateData });
  await auditLog({ userId: session.user.id, organizationId: session.user.organizationId, action: "LEAVE_BALANCE_UPDATED", resourceType: "leave_balance", resourceId: id, oldValues: existing, newValues: updateData });
  return NextResponse.json({ item: updated });
}
`,
]);

routes.push([
  'leave-balances/[id]/adjust/route.ts',
  `// API: /api/leave-balances/[id]/adjust — POST (manual adjustment with audit)
import { NextResponse } from "next.server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import { computeRemainingBalance } from "@/lib/shift-engine";
export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.LEAVE_BALANCE_MANAGE) && !hasPermission(session, PERMISSIONS.LEAVE_MANAGE)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  let body: any;
  try { body = JSON.parse(await req.text() || "{}"); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { adjustmentType, amount, reason } = body;
  if (!adjustmentType || !amount || !reason) return NextResponse.json({ error: "adjustmentType, amount, reason are required" }, { status: 400 });

  const balance = await db.leaveBalance.findUnique({ where: { id } });
  if (!balance || balance.organizationId !== session.user.organizationId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount)) return NextResponse.json({ error: "amount must be a number" }, { status: 400 });

  // Use a transaction: create adjustment record + update balance
  const result = await db.$transaction(async (tx) => {
    // Create adjustment record
    const adj = await tx.leaveBalanceAdjustment.create({
      data: {
        leaveBalanceId: balance.id,
        staffId: balance.staffId,
        adjustmentType,
        amount: numericAmount,
        reason,
        authorizedById: session.user.id,
      },
    });

    // Update balance based on adjustment type
    let newAdjustments = balance.adjustments;
    let newUsed = balance.used;
    let newCarriedForward = balance.carriedForward;
    let newAccrued = balance.accrued;

    if (adjustmentType === "credit" || adjustmentType === "accrual") {
      newAdjustments += numericAmount;
    } else if (adjustmentType === "debit") {
      newAdjustments -= numericAmount;
    } else if (adjustmentType === "carry_forward") {
      newCarriedForward += numericAmount;
    } else if (adjustmentType === "used_deduct") {
      newUsed += numericAmount;
    } else if (adjustmentType === "reset") {
      newAdjustments = 0;
      newUsed = 0;
      newCarriedForward = 0;
      newAccrued = 0;
    }

    const updated = await tx.leaveBalance.update({
      where: { id: balance.id },
      data: {
        adjustments: newAdjustments,
        used: newUsed,
        carriedForward: newCarriedForward,
        accrued: newAccrued,
        remaining: computeRemainingBalance({
          entitlement: balance.entitlement,
          accrued: newAccrued,
          used: newUsed,
          pending: balance.pending,
          carriedForward: newCarriedForward,
          adjustments: newAdjustments,
        }),
      },
    });

    return { adj, updated };
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "LEAVE_BALANCE_ADJUSTED",
    resourceType: "leave_balance",
    resourceId: balance.id,
    oldValues: { adjustments: balance.adjustments, used: balance.used, carriedForward: balance.carriedForward },
    newValues: { adjustmentType, amount: numericAmount, reason },
    reason,
  });

  return NextResponse.json({ item: result.updated, adjustment: result.adj }, { status: 201 });
}
`,
]);

// Write all routes
for (const [relPath, content] of routes) {
  const fullPath = path.join(baseDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  console.log('Wrote:', relPath);
}
console.log(`\\nTotal: ${routes.length} routes written`);

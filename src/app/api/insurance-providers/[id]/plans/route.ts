// =====================================================================
// API: /api/insurance-providers/[id]/plans
//   GET  — list plans for a provider
//   POST — create a new plan for a provider
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

async function getProvider(session: any, id: string) {
  const provider = await db.insuranceProvider.findUnique({ where: { id } });
  if (!provider || provider.organizationId !== session.user.organizationId) return null;
  return provider;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW) && !hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const provider = await getProvider(session, id);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const plans = await db.insurancePlan.findMany({
    where: { insuranceProviderId: id },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { serviceCoverage: true, benefits: true, authorizations: true } },
    },
  });
  return NextResponse.json({ items: plans, count: plans.length });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_PLAN_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const provider = await getProvider(session, id);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const {
    code, name, shortName, description, planType,
    coveragePercentage, fixedCopayment, deductible, annualLimit, visitLimit,
    authorizationRequired, referralRequired,
    status, effectiveDate, endDate, coverageRules, notes,
  } = body;
  if (!code || !name) return NextResponse.json({ error: "code and name are required" }, { status: 400 });
  try {
    const plan = await db.insurancePlan.create({
      data: {
        organizationId: session.user.organizationId,
        insuranceProviderId: id,
        code, name,
        shortName: shortName || null,
        description: description || null,
        planType: planType || "individual",
        coveragePercentage: typeof coveragePercentage === "number" ? coveragePercentage : null,
        fixedCopayment: typeof fixedCopayment === "number" ? fixedCopayment : null,
        deductible: typeof deductible === "number" ? deductible : null,
        annualLimit: typeof annualLimit === "number" ? annualLimit : null,
        visitLimit: typeof visitLimit === "number" ? visitLimit : null,
        authorizationRequired: !!authorizationRequired,
        referralRequired: !!referralRequired,
        status: status || "active",
        effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        coverageRules: coverageRules || null,
        notes: notes || null,
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    });
    await auditLog({
      userId: session.user.id, organizationId: session.user.organizationId,
      action: "INSURANCE_PLAN_CREATED", resourceType: "insurance_plan", resourceId: plan.id,
      newValues: { providerId: id, code, name, planType, status },
    });
    return NextResponse.json({ item: plan }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Plan with this code already exists" }, { status: 409 });
    throw e;
  }
}

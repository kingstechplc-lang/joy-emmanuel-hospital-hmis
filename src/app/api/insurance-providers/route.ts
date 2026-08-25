// =====================================================================
// API: /api/insurance-providers
//   GET  — list providers (org-scoped) with extended fields + filters
//          supports: q, status, providerType, stats=1 (dashboard)
//   POST — create provider with full master fields + duplicate detection
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW) &&
      !hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_VIEW) &&
      !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "";
  const providerType = url.searchParams.get("providerType") || "";
  const statsMode = url.searchParams.get("stats") === "1";

  // ---- Stats dashboard ----
  if (statsMode) {
    const where = { organizationId: session.user.organizationId };
    const [total, active, inactive, suspended, pending, nhisCount, privateCount] = await Promise.all([
      db.insuranceProvider.count({ where }),
      db.insuranceProvider.count({ where: { ...where, status: "active" } }),
      db.insuranceProvider.count({ where: { ...where, status: "inactive" } }),
      db.insuranceProvider.count({ where: { ...where, status: "suspended" } }),
      db.insuranceProvider.count({ where: { ...where, status: "pending" } }),
      db.insuranceProvider.count({ where: { ...where, providerType: "nhis" } }),
      db.insuranceProvider.count({ where: { ...where, providerType: "private" } }),
    ]);
    const totalPlans = await db.insurancePlan.count({ where: { organizationId: session.user.organizationId } });
    const activePlans = await db.insurancePlan.count({ where: { organizationId: session.user.organizationId, status: "active" } });
    const patientsCovered = await db.patientInsurance.count({ where: { insuranceProvider: { organizationId: session.user.organizationId } } });
    const pendingEligibility = await db.eligibilityVerification.count({ where: { organizationId: session.user.organizationId, verificationStatus: "pending" } });
    const pendingAuths = await db.insuranceAuthorization.count({ where: { organizationId: session.user.organizationId, status: "pending" } });
    // Expiring plans (endDate within next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiringPlans = await db.insurancePlan.count({
      where: { organizationId: session.user.organizationId, status: "active", endDate: { gte: new Date(), lte: thirtyDaysFromNow } },
    });
    return NextResponse.json({
      total, active, inactive, suspended, pending,
      nhisCount, privateCount,
      totalPlans, activePlans, expiringPlans,
      patientsCovered, pendingEligibility, pendingAuths,
    });
  }

  // ---- List with filters ----
  const where: any = { organizationId: session.user.organizationId };
  if (status && status !== "all") where.status = status;
  if (providerType && providerType !== "all") where.providerType = providerType;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { legalName: { contains: q, mode: "insensitive" } },
      { shortName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }

  const providers = await db.insuranceProvider.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { patientInsurance: true, insuranceClaims: true, plans: true } },
    },
  });

  return NextResponse.json({ items: providers, count: providers.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_PROVIDER_MANAGE) &&
      !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    name, code, legalName, shortName, displayName, providerType, organizationType,
    country, region, phone, email, website, address, postalAddress,
    contactPerson, claimsContact, financeContact,
    status, effectiveDate, endDate, notes, skipDuplicateCheck,
  } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  }

  const orgId = session.user.organizationId;

  // Duplicate code check (strict)
  const existing = await db.insuranceProvider.findUnique({
    where: { organizationId_code: { organizationId: orgId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: "Provider with this code already exists" }, { status: 409 });
  }

  // Duplicate detection (name/legalName — warn, not block)
  if (!skipDuplicateCheck) {
    const orFilters: any[] = [{ name: { equals: name, mode: "insensitive" } }];
    if (legalName) orFilters.push({ legalName: { equals: legalName, mode: "insensitive" } });
    const duplicates = await db.insuranceProvider.findMany({
      where: {
        organizationId: orgId,
        OR: orFilters,
      },
      select: { id: true, name: true, code: true, status: true },
    });
    if (duplicates.length > 0) {
      return NextResponse.json(
        { error: "Possible duplicate provider detected", duplicates, code: "DUPLICATE_DETECTED" },
        { status: 409 },
      );
    }
  }

  const provider = await db.insuranceProvider.create({
    data: {
      organizationId: orgId,
      name, code,
      legalName: legalName || null,
      shortName: shortName || null,
      displayName: displayName || null,
      providerType: providerType || "private",
      organizationType: organizationType || null,
      country: country || null,
      region: region || null,
      phone: phone || null,
      email: email || null,
      website: website || null,
      address: address || null,
      postalAddress: postalAddress || null,
      contactPerson: contactPerson || null,
      claimsContact: claimsContact || null,
      financeContact: financeContact || null,
      status: status || "active",
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      notes: notes || null,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: orgId,
    action: "INSURANCE_PROVIDER_CREATED",
    resourceType: "insurance_provider",
    resourceId: provider.id,
    newValues: { name, code, providerType, status },
  });

  return NextResponse.json({ item: provider }, { status: 201 });
}

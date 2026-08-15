// =====================================================================
// API: /api/insurance-providers
//   GET  — list insurance providers (org-scoped)
//   POST — create provider
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.INSURANCE_VIEW) && !hasPermission(session, PERMISSIONS.SETTINGS_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "";

  const where: any = { organizationId: session.user.organizationId };
  if (status && status !== "all") where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { code: { contains: q } },
    ];
  }

  const providers = await db.insuranceProvider.findMany({
    where,
    orderBy: { name: "asc" },
    include: { _count: { select: { patientInsurance: true, insuranceClaims: true } } },
  });

  const items = providers.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    phone: p.phone,
    email: p.email,
    address: p.address,
    status: p.status,
    patientsCount: p._count.patientInsurance,
    claimsCount: p._count.insuranceClaims,
  }));

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, code, phone, email, address, status } = body;

  if (!name || !code) {
    return NextResponse.json({ error: "name and code are required" }, { status: 400 });
  }

  const orgId = session.user.organizationId;
  const existing = await db.insuranceProvider.findUnique({
    where: { organizationId_code: { organizationId: orgId, code } },
  });
  if (existing) {
    return NextResponse.json({ error: "Provider with this code already exists" }, { status: 409 });
  }

  const provider = await db.insuranceProvider.create({
    data: {
      organizationId: orgId,
      name,
      code,
      phone: phone || null,
      email: email || null,
      address: address || null,
      status: status || "active",
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: orgId,
    action: "INSURANCE_PROVIDER_CREATED",
    resourceType: "insurance_provider",
    resourceId: provider.id,
    newValues: { name, code, status },
  });

  return NextResponse.json({ item: provider }, { status: 201 });
}

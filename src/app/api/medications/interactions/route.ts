// =====================================================================
// API: /api/medications/interactions
//   GET  — list interaction rules
//   POST — create an interaction rule
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
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const interactions = await db.medicationInteraction.findMany({
    where: { organizationId: session.user.organizationId, isActive: true },
    include: {
      medicationA: { select: { id: true, genericName: true, therapeuticClass: true } },
      medicationB: { select: { id: true, genericName: true, therapeuticClass: true } },
    },
    orderBy: { severity: "asc" },
  });

  return NextResponse.json({ items: interactions, count: interactions.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.MEDICATION_MANAGE) && !hasPermission(session, PERMISSIONS.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const { medicationAId, medicationBId, therapeuticClassA, therapeuticClassB, severity, description, clinicalAdvice } = body;

  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  if (!medicationAId && !therapeuticClassA) {
    return NextResponse.json({ error: "Either medicationAId or therapeuticClassA is required" }, { status: 400 });
  }

  const interaction = await db.medicationInteraction.create({
    data: {
      organizationId: session.user.organizationId,
      medicationAId: medicationAId || null,
      medicationBId: medicationBId || null,
      therapeuticClassA: therapeuticClassA || null,
      therapeuticClassB: therapeuticClassB || null,
      severity: severity || "moderate",
      description,
      clinicalAdvice: clinicalAdvice || null,
      isActive: true,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "MEDICATION_INTERACTION_CREATED",
    resourceType: "medication_interaction",
    resourceId: interaction.id,
    newValues: { medicationAId, medicationBId, therapeuticClassA, therapeuticClassB, severity },
  });

  return NextResponse.json({ item: interaction }, { status: 201 });
}

// =====================================================================
// CHECK — POST /api/medications/interactions/check
// Body: { medicationIds: string[] }
// Returns: interactions found between the given medications
// =====================================================================
export async function CHECK(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PHARMACY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { medicationIds } = body;
  if (!Array.isArray(medicationIds) || medicationIds.length < 2) {
    return NextResponse.json({ items: [], count: 0 });
  }

  // Load the medications to get their therapeutic classes
  const meds = await db.medication.findMany({
    where: { id: { in: medicationIds } },
    select: { id: true, genericName: true, therapeuticClass: true },
  });

  const medClasses = new Map(meds.map((m) => [m.id, m.therapeuticClass]));
  const medIds = new Set(medicationIds);

  // Query all active interactions for this org
  const allInteractions = await db.medicationInteraction.findMany({
    where: { organizationId: session.user.organizationId, isActive: true },
    include: {
      medicationA: { select: { id: true, genericName: true } },
      medicationB: { select: { id: true, genericName: true } },
    },
  });

  // Filter to interactions that match the given medications
  const matched = allInteractions.filter((ix) => {
    // Check medication-ID based interactions
    if (ix.medicationAId && ix.medicationBId) {
      return medIds.has(ix.medicationAId) && medIds.has(ix.medicationBId);
    }
    // Check therapeutic-class based interactions
    if (ix.therapeuticClassA && ix.therapeuticClassB) {
      const classesInList = new Set(
        [...medClasses.values()].filter(Boolean) as string[]
      );
      return classesInList.has(ix.therapeuticClassA) && classesInList.has(ix.therapeuticClassB);
    }
    // Mixed: one med by ID, one by class
    if (ix.medicationAId && ix.therapeuticClassB) {
      if (!medIds.has(ix.medicationAId)) return false;
      const medAClass = medClasses.get(ix.medicationAId);
      return [...medClasses.values()].includes(ix.therapeuticClassB) && medAClass !== ix.therapeuticClassB;
    }
    if (ix.medicationBId && ix.therapeuticClassA) {
      if (!medIds.has(ix.medicationBId)) return false;
      const medBClass = medClasses.get(ix.medicationBId);
      return [...medClasses.values()].includes(ix.therapeuticClassA) && medBClass !== ix.therapeuticClassA;
    }
    return false;
  });

  return NextResponse.json({ items: matched, count: matched.length });
}

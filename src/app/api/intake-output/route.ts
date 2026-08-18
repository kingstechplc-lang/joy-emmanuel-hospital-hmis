// =====================================================================
// API: /api/intake-output
//   GET  — list intake/output entries for a patient (with daily totals)
//   POST — record a new intake/output entry
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/intake-output?patientId=...&date=YYYY-MM-DD&from=YYYY-MM-DD&to=YYYY-MM-DD
//   - Returns entries (chronological), plus dailyTotals grouped by date.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  const date = url.searchParams.get("date"); // single day
  const from = url.searchParams.get("from"); // range start
  const to = url.searchParams.get("to"); // range end
  const limit = parseInt(url.searchParams.get("limit") || "500");

  if (!patientId) {
    return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  }

  // Validate patient belongs to user's org
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const where: any = { patientId };

  if (date) {
    const start = new Date(date + "T00:00:00");
    const end = new Date(date + "T23:59:59.999");
    where.recordedAt = { gte: start, lte: end };
  } else if (from || to) {
    const range: any = {};
    if (from) range.gte = new Date(from + "T00:00:00");
    if (to) range.lte = new Date(to + "T23:59:59.999");
    where.recordedAt = range;
  }

  const entries = await db.intakeOutputEntry.findMany({
    where,
    orderBy: { recordedAt: "desc" },
    take: limit,
    include: {
      recordedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  // Compute daily totals (group by YYYY-MM-DD)
  const totalsByDate = new Map<string, { intake: number; output: number }>();
  for (const e of entries) {
    const d = new Date(e.recordedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cur = totalsByDate.get(key) || { intake: 0, output: 0 };
    if (e.entryType === "intake") cur.intake += e.amount;
    else if (e.entryType === "output") cur.output += e.amount;
    totalsByDate.set(key, cur);
  }
  const dailyTotals = Array.from(totalsByDate.entries())
    .map(([date, t]) => ({ date, intake: t.intake, output: t.output, net: t.intake - t.output }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return NextResponse.json({
    items: entries,
    count: entries.length,
    dailyTotals,
    summary: {
      totalIntake: dailyTotals.reduce((s, t) => s + t.intake, 0),
      totalOutput: dailyTotals.reduce((s, t) => s + t.output, 0),
    },
  });
}

// POST /api/intake-output
// body: { patientId, encounterId?, admissionId?, facilityId, entryType, fluidType, amount, recordedAt?, notes? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CLINICAL_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { patientId, encounterId, admissionId, facilityId, entryType, fluidType, amount, recordedAt, notes } = body;

  if (!patientId || !facilityId || !entryType || !fluidType || amount == null) {
    return NextResponse.json(
      { error: "patientId, facilityId, entryType, fluidType, amount are required" },
      { status: 400 }
    );
  }

  const validEntryTypes = ["intake", "output"];
  if (!validEntryTypes.includes(entryType)) {
    return NextResponse.json({ error: `entryType must be one of: ${validEntryTypes.join(", ")}` }, { status: 400 });
  }
  const validFluidTypes = ["oral", "iv", "urine", "drainage", "blood_loss", "other"];
  if (!validFluidTypes.includes(fluidType)) {
    return NextResponse.json({ error: `fluidType must be one of: ${validFluidTypes.join(", ")}` }, { status: 400 });
  }

  const amt = Number(amount);
  if (Number.isNaN(amt) || amt < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }

  // Validate patient / facility / encounter / admission scope
  const patient = await db.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  const facility = await db.facility.findUnique({ where: { id: facilityId } });
  if (!facility || facility.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
  }
  if (encounterId) {
    const enc = await db.encounter.findUnique({ where: { id: encounterId } });
    if (!enc || enc.patientId !== patientId) {
      return NextResponse.json({ error: "Encounter does not belong to this patient" }, { status: 400 });
    }
  }
  if (admissionId) {
    const adm = await db.admission.findUnique({ where: { id: admissionId } });
    if (!adm || adm.patientId !== patientId) {
      return NextResponse.json({ error: "Admission does not belong to this patient" }, { status: 400 });
    }
  }

  const entry = await db.intakeOutputEntry.create({
    data: {
      patientId,
      encounterId: encounterId || null,
      admissionId: admissionId || null,
      facilityId,
      entryType,
      fluidType,
      amount: amt,
      recordedById: session.user.id,
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      notes: notes || null,
    },
    include: {
      recordedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId,
    action: "INTAKE_OUTPUT_RECORDED",
    resourceType: "intake_output_entry",
    resourceId: entry.id,
    newValues: {
      patientId,
      entryType,
      fluidType,
      amount: amt,
      encounterId,
      admissionId,
      notesPreview: notes ? notes.slice(0, 200) : null,
    },
  });

  return NextResponse.json({ item: entry }, { status: 201 });
}

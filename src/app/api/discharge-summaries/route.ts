// =====================================================================
// API: /api/discharge-summaries
//   GET    — list discharge summaries (filter by facility/patient/encounter/status/date)
//   POST   — create a new draft summary, auto-assembling content from the encounter
//
// Lifecycle actions (review/approve/finalize/amend/update/delete) live in
// the [id]/route.ts file.
//
// PERMISSIONS:
//   GET     requires  discharge_summary.view
//   POST    requires  discharge_summary.create
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";
import {
  assembleDischargeSummaryContent,
  nextDischargeSummaryNumber,
} from "@/lib/discharge-summary/assembler";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VALID_STATUSES = ["draft", "reviewed", "approved", "finalized", "amended"];
const VALID_LIFECYCLE_ACTIONS = ["review", "approve", "finalize", "amend", "update"];

// GET /api/discharge-summaries?facilityId=...&patientId=...&encounterId=...&status=...&from=...&to=...&limit=...
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DISCHARGE_SUMMARY_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId") || session.user.facilityId || undefined;
  const patientId = url.searchParams.get("patientId") || undefined;
  const encounterId = url.searchParams.get("encounterId") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "100");

  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const where: any = {};
  if (facilityId) where.facilityId = facilityId;
  if (patientId) where.patientId = patientId;
  if (encounterId) where.encounterId = encounterId;
  if (status) where.status = status;
  if (from || to) {
    const range: any = {};
    if (from) range.gte = new Date(`${from}T00:00:00`);
    if (to) range.lte = new Date(`${to}T23:59:59.999`);
    where.createdAt = range;
  }

  try {
    const items = await db.dischargeSummary.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 500),
      include: {
        patient: {
          select: { id: true, patientNumber: true, firstName: true, lastName: true, dateOfBirth: true, sex: true },
        },
        encounter: {
          select: { id: true, encounterNumber: true, encounterType: true, status: true, startAt: true, endAt: true },
        },
        attendingClinician: {
          select: { id: true, firstName: true, lastName: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        finalizedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json({ items, count: items.length });
  } catch (e: any) {
    console.error("[GET /api/discharge-summaries]", e);
    return NextResponse.json({ error: e.message || "Failed to load summaries" }, { status: 500 });
  }
}

// POST /api/discharge-summaries
//   Body: { encounterId: string, content?: string (optional — if omitted, auto-assembled) }
//   Returns: { id, summaryNumber, status, content }
//
// The caller must pass an encounterId. The server:
//   1. Loads the encounter (and its patient + facility + admission + dischargeRecord chain).
//   2. Assembles the structured content via `assembleDischargeSummaryContent`.
//   3. Generates the next summary number in the format DSum-YYYY-000001.
//   4. Persists a new DischargeSummary in "draft" status.
//   5. Audit-logs the creation.
//
// If a draft already exists for this encounter, returns 409 Conflict so the
// client can decide whether to open the existing draft or generate a new one.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.DISCHARGE_SUMMARY_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { encounterId } = body;
  if (!encounterId) {
    return NextResponse.json({ error: "encounterId is required" }, { status: 400 });
  }

  try {
    // Check for an existing draft for this encounter (one draft per encounter)
    const existingDraft = await db.dischargeSummary.findFirst({
      where: { encounterId, status: { in: ["draft", "reviewed", "approved"] } },
      select: { id: true, summaryNumber: true, status: true },
    });
    if (existingDraft) {
      return NextResponse.json(
        {
          error: "A draft summary already exists for this encounter. Open or finalize the existing one before creating a new draft.",
          existingId: existingDraft.id,
          existingSummaryNumber: existingDraft.summaryNumber,
          existingStatus: existingDraft.status,
        },
        { status: 409 },
      );
    }

    // Assemble the content from encounter data
    const assembled = await assembleDischargeSummaryContent(encounterId);

    // Generate the next summary number
    const summaryNumber = await nextDischargeSummaryNumber(assembled.facilityId);

    // Optional: accept caller-provided content overlay (e.g., edited sections)
    // For now, we always store the assembled content. The PATCH endpoint can
    // later receive user edits.
    const contentJson =
      typeof body.content === "string" && body.content.trim()
        ? body.content
        : JSON.stringify(assembled.content);

    const created = await db.dischargeSummary.create({
      data: {
        summaryNumber,
        organizationId: assembled.organizationId,
        facilityId: assembled.facilityId,
        patientId: assembled.patientId,
        encounterId,
        admissionId: assembled.admissionId,
        dischargeRecordId: assembled.dischargeRecordId,
        status: "draft",
        version: 1,
        content: contentJson,
        attendingClinicianId: assembled.attendingClinicianId,
        primaryDiagnosisName: assembled.primaryDiagnosisName,
        primaryDiagnosisCode: assembled.primaryDiagnosisCode,
        createdById: session.user.id,
      },
      select: {
        id: true,
        summaryNumber: true,
        status: true,
        version: true,
        content: true,
        primaryDiagnosisName: true,
        primaryDiagnosisCode: true,
        attendingClinicianId: true,
        patientId: true,
        encounterId: true,
        admissionId: true,
        dischargeRecordId: true,
        createdAt: true,
      },
    });

    await auditLog({
      userId: session.user.id,
      organizationId: assembled.organizationId,
      facilityId: assembled.facilityId,
      action: "discharge_summary.create",
      resourceType: "DischargeSummary",
      resourceId: created.id,
      newValues: { summaryNumber, encounterId, status: "draft" },
    });

    return NextResponse.json({ ...created, content: created.content }, { status: 201 });
  } catch (e: any) {
    console.error("[POST /api/discharge-summaries]", e);
    return NextResponse.json({ error: e.message || "Failed to create summary" }, { status: 500 });
  }
}

// Re-export lifecycle action names for documentation purposes
export { VALID_LIFECYCLE_ACTIONS };

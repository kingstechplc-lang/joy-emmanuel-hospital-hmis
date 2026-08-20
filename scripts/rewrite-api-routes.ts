// =====================================================================
// FIX API ROUTES — completely rewrite POST routes with correct code
// =====================================================================
import * as fs from "fs";
import * as path from "path";

const ROOT = "/home/z/my-project/src/app/api";

interface Spec {
  path: string;
  requiredFields: string[];
  numberField?: string;
  numberPrefix: string;
  modelName: string;
  auditPrefix: string;
  viewPermConst: string;
  managePermConst: string;
  searchField: string;
}

const SPECS: Spec[] = [
  { path: "blood-bank/donors", requiredFields: ["fullName"], numberField: "donorNumber", numberPrefix: "DON", modelName: "bloodDonor", auditPrefix: "BLOOD_DONOR", viewPermConst: "BLOODBANK_VIEW", managePermConst: "BLOODBANK_MANAGE", searchField: "fullName" },
  { path: "blood-bank/units", requiredFields: ["donorId", "bloodGroup", "expiryDate"], numberField: "unitNumber", numberPrefix: "BU", modelName: "bloodUnit", auditPrefix: "BLOOD_UNIT", viewPermConst: "BLOODBANK_VIEW", managePermConst: "BLOODBANK_MANAGE", searchField: "unitNumber" },
  { path: "blood-bank/transfusions", requiredFields: ["patientName", "unitId"], numberField: "transfusionNumber", numberPrefix: "TRX", modelName: "bloodTransfusion", auditPrefix: "BLOOD_TRANSFUSION", viewPermConst: "BLOODBANK_VIEW", managePermConst: "BLOODBANK_TRANSFUSE", searchField: "transfusionNumber" },
  { path: "theatre", requiredFields: ["patientName", "procedureName", "scheduledStart"], numberField: "caseNumber", numberPrefix: "OR", modelName: "theatreCase", auditPrefix: "THEATRE_CASE", viewPermConst: "THEATRE_VIEW", managePermConst: "THEATRE_MANAGE", searchField: "caseNumber" },
  { path: "critical-care", requiredFields: ["patientName", "unitType", "admittingDiagnosis"], numberField: "admissionNumber", numberPrefix: "CC", modelName: "criticalCareAdmission", auditPrefix: "CRITICAL_CARE", viewPermConst: "CRITICAL_CARE_VIEW", managePermConst: "CRITICAL_CARE_MANAGE", searchField: "admissionNumber" },
  { path: "specialty", requiredFields: ["patientName", "departmentCode", "chiefComplaint"], numberField: "encounterNumber", numberPrefix: "SPC", modelName: "specialtyEncounter", auditPrefix: "SPECIALTY_ENCOUNTER", viewPermConst: "SPECIALTY_VIEW", managePermConst: "SPECIALTY_MANAGE", searchField: "encounterNumber" },
  { path: "service-requests", requiredFields: ["serviceType", "title"], numberField: "requestNumber", numberPrefix: "SRV", modelName: "serviceRequest", auditPrefix: "SERVICE_REQUEST", viewPermConst: "SUPPORT_SERVICES_VIEW", managePermConst: "SUPPORT_SERVICES_MANAGE", searchField: "title" },
  { path: "patient-feedback", requiredFields: ["feedbackType", "patientName", "subject", "description"], numberField: "feedbackNumber", numberPrefix: "FB", modelName: "patientFeedback", auditPrefix: "PATIENT_FEEDBACK", viewPermConst: "PATIENT_RELATIONS_VIEW", managePermConst: "PATIENT_RELATIONS_MANAGE", searchField: "subject" },
  { path: "quality-indicators", requiredFields: ["indicatorName"], numberField: "indicatorCode", numberPrefix: "QI", modelName: "qualityIndicator", auditPrefix: "QUALITY_INDICATOR", viewPermConst: "QA_VIEW", managePermConst: "QA_MANAGE", searchField: "indicatorName" },
  { path: "risk-register", requiredFields: ["riskTitle", "description"], numberField: "riskNumber", numberPrefix: "RSK", modelName: "riskRegister", auditPrefix: "RISK_REGISTER", viewPermConst: "RISK_VIEW", managePermConst: "RISK_MANAGE", searchField: "riskTitle" },
  { path: "legal-cases", requiredFields: ["caseType", "title"], numberField: "caseNumber", numberPrefix: "LEG", modelName: "legalCase", auditPrefix: "LEGAL_CASE", viewPermConst: "LEGAL_VIEW", managePermConst: "LEGAL_MANAGE", searchField: "title" },
  { path: "research", requiredFields: ["studyTitle"], numberField: "studyNumber", numberPrefix: "RES", modelName: "researchStudy", auditPrefix: "RESEARCH_STUDY", viewPermConst: "RESEARCH_VIEW", managePermConst: "RESEARCH_MANAGE", searchField: "studyTitle" },
  { path: "pr-activities", requiredFields: ["activityType", "title"], numberField: "activityNumber", numberPrefix: "PR", modelName: "pRActivity", auditPrefix: "PR_ACTIVITY", viewPermConst: "PR_VIEW", managePermConst: "PR_MANAGE", searchField: "title" },
  { path: "it-tickets", requiredFields: ["ticketType", "subject", "description"], numberField: "ticketNumber", numberPrefix: "IT", modelName: "iTTicket", auditPrefix: "IT_TICKET", viewPermConst: "IT_VIEW", managePermConst: "IT_MANAGE", searchField: "subject" },
  { path: "coding-records", requiredFields: ["patientName", "primaryCode", "primaryDescription"], numberField: "", numberPrefix: "", modelName: "codingRecord", auditPrefix: "CODING_RECORD", viewPermConst: "CODING_VIEW", managePermConst: "CODING_MANAGE", searchField: "patientName" },
  { path: "community-outreach", requiredFields: ["eventType", "title", "location", "startDate"], numberField: "eventNumber", numberPrefix: "COM", modelName: "communityOutreach", auditPrefix: "COMMUNITY_OUTREACH", viewPermConst: "COMMUNITY_HEALTH_VIEW", managePermConst: "COMMUNITY_HEALTH_MANAGE", searchField: "title" },
  { path: "home-care", requiredFields: ["patientName", "patientAddress", "visitType", "scheduledAt"], numberField: "visitNumber", numberPrefix: "HC", modelName: "homeCareVisit", auditPrefix: "HOME_CARE_VISIT", viewPermConst: "HOME_CARE_VIEW", managePermConst: "HOME_CARE_MANAGE", searchField: "patientName" },
  { path: "histopathology", requiredFields: ["patientName", "specimenType", "specimenSite"], numberField: "specimenNumber", numberPrefix: "HSP", modelName: "histopathologySpecimen", auditPrefix: "HISTOPATHOLOGY_SPECIMEN", viewPermConst: "HISTOPATHOLOGY_VIEW", managePermConst: "HISTOPATHOLOGY_MANAGE", searchField: "patientName" },
  { path: "recovery-room", requiredFields: ["patientName"], numberField: "recordNumber", numberPrefix: "RR", modelName: "recoveryRoomRecord", auditPrefix: "RECOVERY_RECORD", viewPermConst: "RECOVERY_VIEW", managePermConst: "RECOVERY_MANAGE", searchField: "patientName" },
  { path: "audit-findings", requiredFields: ["auditType", "title", "description"], numberField: "findingNumber", numberPrefix: "AF", modelName: "auditFinding", auditPrefix: "AUDIT_FINDING", viewPermConst: "AUDIT_VIEW", managePermConst: "AUDIT_MANAGE", searchField: "title" },
];

function generateListRoute(spec: Spec): string {
  const reqCheck = spec.requiredFields.map((f) => `body.${f} === undefined || body.${f} === "" || body.${f} === null`).join(" || ");
  const reqNames = spec.requiredFields.join(", ");
  const numberGen = spec.numberField
    ? `  const year = new Date().getFullYear();
  const count = await db.${spec.modelName}.count({ where: { organizationId: session.user.organizationId } });
  const ${spec.numberField} = \`${spec.numberPrefix}-\${year}-\${String(count + 1).padStart(6, "0")}\`;`
    : "";
  const numberAssign = spec.numberField ? `\n      ${spec.numberField},` : "";

  return `// =====================================================================
// API: /api/${spec.path}
//   GET  — list records (filter by facility, status, etc.)
//   POST — create a new record
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
  if (!hasPermission(session, PERMISSIONS.${spec.viewPermConst})) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");

  // Scope to user's facilities
  const orgFacilities = await db.facility.findMany({
    where: { organizationId: session.user.organizationId },
    select: { id: true },
  });
  const orgFacilityIds = orgFacilities.map((f) => f.id);

  const where: any = { organizationId: session.user.organizationId };
  if (facilityId && orgFacilityIds.includes(facilityId)) {
    where.facilityId = facilityId;
  } else {
    where.facilityId = { in: orgFacilityIds };
  }

  // Apply filter params from URL (any param other than facilityId/search/limit)
  for (const [k, v] of url.searchParams.entries()) {
    if (["facilityId", "search", "limit"].includes(k)) continue;
    if (v && v !== "all") {
      if (k === "isActive") {
        where[k] = v === "true";
      } else {
        where[k] = v;
      }
    }
  }

  if (search) {
    where.OR = [
      { ${spec.searchField}: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await db.${spec.modelName}.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return NextResponse.json({ items, count: items.length });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.${spec.managePermConst})) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Validate required fields
  if (${reqCheck}) {
    return NextResponse.json({ error: "Missing required fields: ${reqNames}" }, { status: 400 });
  }

  // Validate facility scope
  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  // Strip protected fields from body before passing to prisma.create
  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, createdById: _cb, facilityId: _fId, ...createData } = body;
${numberGen}

  const item = await db.${spec.modelName}.create({
    data: {
      ...createData,
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,${numberAssign}
      createdById: session.user.id,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId || undefined,
    action: "${spec.auditPrefix}_CREATED",
    resourceType: "${spec.modelName}",
    resourceId: item.id,
  });

  return NextResponse.json({ item }, { status: 201 });
}
`;
}

function generateIdRoute(spec: Spec): string {
  return `// =====================================================================
// API: /api/${spec.path}/[id]
//   GET    — fetch single record
//   PATCH  — update record
//   DELETE — remove record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.${spec.viewPermConst})) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const item = await db.${spec.modelName}.findUnique({ where: { id } });
  if (!item || item.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.${spec.managePermConst})) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const existing = await db.${spec.modelName}.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Strip protected fields
  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, createdById: _cb, ...updateData } = body;

  const updated = await db.${spec.modelName}.update({
    where: { id },
    data: updateData,
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "${spec.auditPrefix}_UPDATED",
    resourceType: "${spec.modelName}",
    resourceId: id,
    oldValues: existing,
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.${spec.managePermConst})) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await db.${spec.modelName}.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.${spec.modelName}.delete({ where: { id } });
  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    facilityId: existing.facilityId || undefined,
    action: "${spec.auditPrefix}_DELETED",
    resourceType: "${spec.modelName}",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
`;
}

let count = 0;
for (const spec of SPECS) {
  const dir = path.join(ROOT, spec.path);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "[id]"), { recursive: true });

  fs.writeFileSync(path.join(dir, "route.ts"), generateListRoute(spec));
  fs.writeFileSync(path.join(dir, "[id]", "route.ts"), generateIdRoute(spec));
  count += 2;
}

console.log(`Rewrote ${count} route files`);

// Generate API route files for all remaining modules
import * as fs from "fs";
import * as path from "path";

const ROOT = "/home/z/my-project/src/app/api";

interface RouteSpec {
  path: string;            // relative path e.g. "blood-bank/donors"
  modelName: string;       // Prisma model name e.g. "bloodDonor"
  entityName: string;      // human e.g. "donor"
  numberPrefix: string;    // e.g. "DON"
  numberField: string;     // e.g. "donorNumber"
  viewPermission: string;  // e.g. "BLOODBANK_VIEW"
  managePermission: string; // e.g. "BLOODBANK_MANAGE"
  requiredFields: string[]; // e.g. ["fullName"]
  searchFields: string[];   // e.g. ["fullName", "donorNumber"]
  filterFields?: { param: string; column: string }[];
  auditPrefix: string;     // e.g. "BLOOD_DONOR"
}

const ROUTES: RouteSpec[] = [
  {
    path: "blood-bank/donors",
    modelName: "bloodDonor",
    entityName: "donor",
    numberPrefix: "DON",
    numberField: "donorNumber",
    viewPermission: "BLOODBANK_VIEW",
    managePermission: "BLOODBANK_MANAGE",
    requiredFields: ["fullName"],
    searchFields: ["fullName", "donorNumber", "phone", "bloodGroup"],
    filterFields: [{ param: "bloodGroup", column: "bloodGroup" }, { param: "eligibilityStatus", column: "eligibilityStatus" }],
    auditPrefix: "BLOOD_DONOR",
  },
  {
    path: "blood-bank/units",
    modelName: "bloodUnit",
    entityName: "blood unit",
    numberPrefix: "BU",
    numberField: "unitNumber",
    viewPermission: "BLOODBANK_VIEW",
    managePermission: "BLOODBANK_MANAGE",
    requiredFields: ["donorId", "bloodGroup", "expiryDate"],
    searchFields: ["unitNumber", "bloodGroup"],
    filterFields: [{ param: "status", column: "status" }, { param: "bloodGroup", column: "bloodGroup" }, { param: "componentType", column: "componentType" }],
    auditPrefix: "BLOOD_UNIT",
  },
  {
    path: "blood-bank/transfusions",
    modelName: "bloodTransfusion",
    entityName: "transfusion",
    numberPrefix: "TRX",
    numberField: "transfusionNumber",
    viewPermission: "BLOODBANK_VIEW",
    managePermission: "BLOODBANK_TRANSFUSE",
    requiredFields: ["patientName", "unitId"],
    searchFields: ["transfusionNumber", "patientName"],
    filterFields: [{ param: "status", column: "status" }],
    auditPrefix: "BLOOD_TRANSFUSION",
  },
  {
    path: "theatre",
    modelName: "theatreCase",
    entityName: "theatre case",
    numberPrefix: "OR",
    numberField: "caseNumber",
    viewPermission: "THEATRE_VIEW",
    managePermission: "THEATRE_MANAGE",
    requiredFields: ["patientName", "procedureName", "scheduledStart"],
    searchFields: ["caseNumber", "patientName", "procedureName", "surgeonName"],
    filterFields: [{ param: "status", column: "status" }, { param: "procedureType", column: "procedureType" }],
    auditPrefix: "THEATRE_CASE",
  },
  {
    path: "critical-care",
    modelName: "criticalCareAdmission",
    entityName: "critical care admission",
    numberPrefix: "CC",
    numberField: "admissionNumber",
    viewPermission: "CRITICAL_CARE_VIEW",
    managePermission: "CRITICAL_CARE_MANAGE",
    requiredFields: ["patientName", "unitType", "admittingDiagnosis"],
    searchFields: ["admissionNumber", "patientName", "admittingDiagnosis"],
    filterFields: [{ param: "status", column: "status" }, { param: "unitType", column: "unitType" }],
    auditPrefix: "CRITICAL_CARE",
  },
  {
    path: "specialty",
    modelName: "specialtyEncounter",
    entityName: "specialty encounter",
    numberPrefix: "SPC",
    numberField: "encounterNumber",
    viewPermission: "SPECIALTY_VIEW",
    managePermission: "SPECIALTY_MANAGE",
    requiredFields: ["patientName", "departmentCode", "chiefComplaint"],
    searchFields: ["encounterNumber", "patientName", "chiefComplaint", "diagnosis"],
    filterFields: [{ param: "departmentCode", column: "departmentCode" }, { param: "status", column: "status" }],
    auditPrefix: "SPECIALTY_ENCOUNTER",
  },
  {
    path: "service-requests",
    modelName: "serviceRequest",
    entityName: "service request",
    numberPrefix: "SRV",
    numberField: "requestNumber",
    viewPermission: "SUPPORT_SERVICES_VIEW",
    managePermission: "SUPPORT_SERVICES_MANAGE",
    requiredFields: ["serviceType", "title"],
    searchFields: ["requestNumber", "title", "patientName", "location"],
    filterFields: [
      { param: "serviceType", column: "serviceType" },
      { param: "status", column: "status" },
      { param: "priority", column: "priority" },
      { param: "departmentCode", column: "departmentCode" },
    ],
    auditPrefix: "SERVICE_REQUEST",
  },
  {
    path: "patient-feedback",
    modelName: "patientFeedback",
    entityName: "patient feedback",
    numberPrefix: "FB",
    numberField: "feedbackNumber",
    viewPermission: "PATIENT_RELATIONS_VIEW",
    managePermission: "PATIENT_RELATIONS_MANAGE",
    requiredFields: ["feedbackType", "patientName", "subject", "description"],
    searchFields: ["feedbackNumber", "patientName", "subject", "description"],
    filterFields: [
      { param: "feedbackType", column: "feedbackType" },
      { param: "status", column: "status" },
      { param: "severity", column: "severity" },
    ],
    auditPrefix: "PATIENT_FEEDBACK",
  },
  {
    path: "quality-indicators",
    modelName: "qualityIndicator",
    entityName: "quality indicator",
    numberPrefix: "QI",
    numberField: "indicatorCode",
    viewPermission: "QA_VIEW",
    managePermission: "QA_MANAGE",
    requiredFields: ["indicatorName"],
    searchFields: ["indicatorCode", "indicatorName", "category"],
    filterFields: [{ param: "category", column: "category" }, { param: "isActive", column: "isActive" }],
    auditPrefix: "QUALITY_INDICATOR",
  },
  {
    path: "risk-register",
    modelName: "riskRegister",
    entityName: "risk",
    numberPrefix: "RSK",
    numberField: "riskNumber",
    viewPermission: "RISK_VIEW",
    managePermission: "RISK_MANAGE",
    requiredFields: ["riskTitle", "description"],
    searchFields: ["riskNumber", "riskTitle", "description", "owner"],
    filterFields: [{ param: "status", column: "status" }, { param: "riskCategory", column: "riskCategory" }],
    auditPrefix: "RISK_REGISTER",
  },
  {
    path: "legal-cases",
    modelName: "legalCase",
    entityName: "legal case",
    numberPrefix: "LEG",
    numberField: "caseNumber",
    viewPermission: "LEGAL_VIEW",
    managePermission: "LEGAL_MANAGE",
    requiredFields: ["caseType", "title"],
    searchFields: ["caseNumber", "title", "plaintiffName", "defendantName"],
    filterFields: [{ param: "caseType", column: "caseType" }, { param: "status", column: "status" }],
    auditPrefix: "LEGAL_CASE",
  },
  {
    path: "research",
    modelName: "researchStudy",
    entityName: "research study",
    numberPrefix: "RES",
    numberField: "studyNumber",
    viewPermission: "RESEARCH_VIEW",
    managePermission: "RESEARCH_MANAGE",
    requiredFields: ["studyTitle"],
    searchFields: ["studyNumber", "studyTitle", "principalInvestigator"],
    filterFields: [{ param: "status", column: "status" }],
    auditPrefix: "RESEARCH_STUDY",
  },
  {
    path: "pr-activities",
    modelName: "pRActivity",
    entityName: "PR activity",
    numberPrefix: "PR",
    numberField: "activityNumber",
    viewPermission: "PR_VIEW",
    managePermission: "PR_MANAGE",
    requiredFields: ["activityType", "title"],
    searchFields: ["activityNumber", "title", "mediaOutlet", "contactPerson"],
    filterFields: [{ param: "activityType", column: "activityType" }, { param: "status", column: "status" }],
    auditPrefix: "PR_ACTIVITY",
  },
  {
    path: "it-tickets",
    modelName: "iTTicket",
    entityName: "IT ticket",
    numberPrefix: "IT",
    numberField: "ticketNumber",
    viewPermission: "IT_VIEW",
    managePermission: "IT_MANAGE",
    requiredFields: ["ticketType", "subject", "description"],
    searchFields: ["ticketNumber", "subject", "description", "affectedSystem", "reportedByName"],
    filterFields: [
      { param: "ticketType", column: "ticketType" },
      { param: "status", column: "status" },
      { param: "priority", column: "priority" },
    ],
    auditPrefix: "IT_TICKET",
  },
  {
    path: "coding-records",
    modelName: "codingRecord",
    entityName: "coding record",
    numberPrefix: "COD",
    numberField: "",
    viewPermission: "CODING_VIEW",
    managePermission: "CODING_MANAGE",
    requiredFields: ["patientName", "primaryCode", "primaryDescription"],
    searchFields: ["patientName", "primaryCode", "primaryDescription"],
    filterFields: [{ param: "codingType", column: "codingType" }, { param: "claimStatus", column: "claimStatus" }],
    auditPrefix: "CODING_RECORD",
  },
  {
    path: "community-outreach",
    modelName: "communityOutreach",
    entityName: "community outreach",
    numberPrefix: "COM",
    numberField: "eventNumber",
    viewPermission: "COMMUNITY_HEALTH_VIEW",
    managePermission: "COMMUNITY_HEALTH_MANAGE",
    requiredFields: ["eventType", "title", "location", "startDate"],
    searchFields: ["eventNumber", "title", "location", "teamLeadName"],
    filterFields: [{ param: "eventType", column: "eventType" }, { param: "status", column: "status" }],
    auditPrefix: "COMMUNITY_OUTREACH",
  },
  {
    path: "home-care",
    modelName: "homeCareVisit",
    entityName: "home care visit",
    numberPrefix: "HC",
    numberField: "visitNumber",
    viewPermission: "HOME_CARE_VIEW",
    managePermission: "HOME_CARE_MANAGE",
    requiredFields: ["patientName", "patientAddress", "visitType", "scheduledAt"],
    searchFields: ["visitNumber", "patientName", "patientAddress"],
    filterFields: [{ param: "status", column: "status" }, { param: "visitType", column: "visitType" }],
    auditPrefix: "HOME_CARE_VISIT",
  },
  {
    path: "histopathology",
    modelName: "histopathologySpecimen",
    entityName: "histopathology specimen",
    numberPrefix: "HSP",
    numberField: "specimenNumber",
    viewPermission: "HISTOPATHOLOGY_VIEW",
    managePermission: "HISTOPATHOLOGY_MANAGE",
    requiredFields: ["patientName", "specimenType", "specimenSite"],
    searchFields: ["specimenNumber", "patientName", "specimenSite", "diagnosis"],
    filterFields: [{ param: "status", column: "status" }, { param: "specimenType", column: "specimenType" }],
    auditPrefix: "HISTOPATHOLOGY_SPECIMEN",
  },
  {
    path: "recovery-room",
    modelName: "recoveryRoomRecord",
    entityName: "recovery record",
    numberPrefix: "RR",
    numberField: "recordNumber",
    viewPermission: "RECOVERY_VIEW",
    managePermission: "RECOVERY_MANAGE",
    requiredFields: ["patientName"],
    searchFields: ["recordNumber", "patientName", "theatreCaseNumber"],
    filterFields: [{ param: "status", column: "status" }],
    auditPrefix: "RECOVERY_RECORD",
  },
  {
    path: "audit-findings",
    modelName: "auditFinding",
    entityName: "audit finding",
    numberPrefix: "AF",
    numberField: "findingNumber",
    viewPermission: "AUDIT_VIEW",
    managePermission: "AUDIT_MANAGE",
    requiredFields: ["auditType", "title", "description"],
    searchFields: ["findingNumber", "title", "description", "auditorName"],
    filterFields: [
      { param: "auditType", column: "auditType" },
      { param: "status", column: "status" },
      { param: "severity", column: "severity" },
    ],
    auditPrefix: "AUDIT_FINDING",
  },
];

function generateListRoute(spec: RouteSpec): string {
  const filterClauses = (spec.filterFields || [])
    .map((f) => `  if (${f.param} && ${f.param} !== "all") where.${f.column} = ${f.param};`)
    .join("\n");

  const searchClauses = spec.searchFields
    .map((f) => `{ ${f}: { contains: search, mode: "insensitive" } }`)
    .join(", ");

  const requiredCheck = spec.requiredFields
    .map((f) => `!${f}`)
    .join(" || ");

  const numberGen = spec.numberField
    ? `  const year = new Date().getFullYear();
  const count = await db.${spec.modelName}.count({ where: { organizationId: session.user.organizationId } });
  const ${spec.numberField} = \`${spec.numberPrefix}-\${year}-\${String(count + 1).padStart(6, "0")}\`;`
    : "";

  const numberAssign = spec.numberField ? `\n      ${spec.numberField},` : "";

  return `// =====================================================================
// API: /api/${spec.path}
//   GET  — list ${spec.entityName} records
//   POST — create a new ${spec.entityName}
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
  if (!hasPermission(session, PERMISSIONS.${spec.viewPermission})) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");
${(spec.filterFields || [])
  .map((f) => `  const ${f.param} = url.searchParams.get("${f.param}");`)
  .join("\n")}

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
${filterClauses}
  if (search) {
    where.OR = [${searchClauses}];
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
  if (!hasPermission(session, PERMISSIONS.${spec.managePermission})) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  if (${requiredCheck}) {
    return NextResponse.json({ error: "Missing required fields: ${spec.requiredFields.join(", ")}" }, { status: 400 });
  }

  let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }
${numberGen}

  const item = await db.${spec.modelName}.create({
    data: {
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,${numberAssign}
      ...body,
      facilityId: resolvedFacilityId,
      organizationId: session.user.organizationId,
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

function generateIdRoute(spec: RouteSpec): string {
  return `// =====================================================================
// API: /api/${spec.path}/[id]
//   GET    — fetch single ${spec.entityName}
//   PATCH  — update ${spec.entityName}
//   DELETE — remove ${spec.entityName}
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
  if (!hasPermission(session, PERMISSIONS.${spec.viewPermission})) {
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
  if (!hasPermission(session, PERMISSIONS.${spec.managePermission})) {
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
  if (!hasPermission(session, PERMISSIONS.${spec.managePermission})) {
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
for (const spec of ROUTES) {
  const dir = path.join(ROOT, spec.path);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "[id]"), { recursive: true });

  fs.writeFileSync(path.join(dir, "route.ts"), generateListRoute(spec));
  fs.writeFileSync(path.join(dir, "[id]", "route.ts"), generateIdRoute(spec));
  count += 2;
}

console.log(`Generated ${count} route files for ${ROUTES.length} modules`);

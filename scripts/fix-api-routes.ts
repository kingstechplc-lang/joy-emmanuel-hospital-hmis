// Fix all generated API route files - repair validation + duplicate keys
import * as fs from "fs";
import * as path from "path";

const ROOT = "/home/z/my-project/src/app/api";

interface Spec {
  path: string;
  requiredFields: string[];
  numberField?: string;
  modelName: string;
  auditPrefix: string;
}

const SPECS: Spec[] = [
  { path: "blood-bank/donors", requiredFields: ["fullName"], numberField: "donorNumber", modelName: "bloodDonor", auditPrefix: "BLOOD_DONOR" },
  { path: "blood-bank/units", requiredFields: ["donorId", "bloodGroup", "expiryDate"], numberField: "unitNumber", modelName: "bloodUnit", auditPrefix: "BLOOD_UNIT" },
  { path: "blood-bank/transfusions", requiredFields: ["patientName", "unitId"], numberField: "transfusionNumber", modelName: "bloodTransfusion", auditPrefix: "BLOOD_TRANSFUSION" },
  { path: "theatre", requiredFields: ["patientName", "procedureName", "scheduledStart"], numberField: "caseNumber", modelName: "theatreCase", auditPrefix: "THEATRE_CASE" },
  { path: "critical-care", requiredFields: ["patientName", "unitType", "admittingDiagnosis"], numberField: "admissionNumber", modelName: "criticalCareAdmission", auditPrefix: "CRITICAL_CARE" },
  { path: "specialty", requiredFields: ["patientName", "departmentCode", "chiefComplaint"], numberField: "encounterNumber", modelName: "specialtyEncounter", auditPrefix: "SPECIALTY_ENCOUNTER" },
  { path: "service-requests", requiredFields: ["serviceType", "title"], numberField: "requestNumber", modelName: "serviceRequest", auditPrefix: "SERVICE_REQUEST" },
  { path: "patient-feedback", requiredFields: ["feedbackType", "patientName", "subject", "description"], numberField: "feedbackNumber", modelName: "patientFeedback", auditPrefix: "PATIENT_FEEDBACK" },
  { path: "quality-indicators", requiredFields: ["indicatorName"], numberField: "indicatorCode", modelName: "qualityIndicator", auditPrefix: "QUALITY_INDICATOR" },
  { path: "risk-register", requiredFields: ["riskTitle", "description"], numberField: "riskNumber", modelName: "riskRegister", auditPrefix: "RISK_REGISTER" },
  { path: "legal-cases", requiredFields: ["caseType", "title"], numberField: "caseNumber", modelName: "legalCase", auditPrefix: "LEGAL_CASE" },
  { path: "research", requiredFields: ["studyTitle"], numberField: "studyNumber", modelName: "researchStudy", auditPrefix: "RESEARCH_STUDY" },
  { path: "pr-activities", requiredFields: ["activityType", "title"], numberField: "activityNumber", modelName: "pRActivity", auditPrefix: "PR_ACTIVITY" },
  { path: "it-tickets", requiredFields: ["ticketType", "subject", "description"], numberField: "ticketNumber", modelName: "iTTicket", auditPrefix: "IT_TICKET" },
  { path: "coding-records", requiredFields: ["patientName", "primaryCode", "primaryDescription"], numberField: "", modelName: "codingRecord", auditPrefix: "CODING_RECORD" },
  { path: "community-outreach", requiredFields: ["eventType", "title", "location", "startDate"], numberField: "eventNumber", modelName: "communityOutreach", auditPrefix: "COMMUNITY_OUTREACH" },
  { path: "home-care", requiredFields: ["patientName", "patientAddress", "visitType", "scheduledAt"], numberField: "visitNumber", modelName: "homeCareVisit", auditPrefix: "HOME_CARE_VISIT" },
  { path: "histopathology", requiredFields: ["patientName", "specimenType", "specimenSite"], numberField: "specimenNumber", modelName: "histopathologySpecimen", auditPrefix: "HISTOPATHOLOGY_SPECIMEN" },
  { path: "recovery-room", requiredFields: ["patientName"], numberField: "recordNumber", modelName: "recoveryRoomRecord", auditPrefix: "RECOVERY_RECORD" },
  { path: "audit-findings", requiredFields: ["auditType", "title", "description"], numberField: "findingNumber", modelName: "auditFinding", auditPrefix: "AUDIT_FINDING" },
];

function generateListRoute(spec: Spec): string {
  const reqCheck = spec.requiredFields.map((f) => `body.${f} === undefined || body.${f} === "" || body.${f} === null`).join(" || ");
  const reqNames = spec.requiredFields.join(", ");
  const numberGen = spec.numberField
    ? `  const year = new Date().getFullYear();
  const count = await db.${spec.modelName}.count({ where: { organizationId: session.user.organizationId } });
  const ${spec.numberField} = \`${spec.numberField === "indicatorCode" ? "QI" : spec.numberField === "indicatorCode" ? "QI" : spec.path.split("-")[0].toUpperCase().slice(0,3)}-\${year}-\${String(count + 1).padStart(6, "0")}\`;`
    : "";

  const numberAssign = spec.numberField ? `\n      ${spec.numberField},` : "";

  return `// =====================================================================
// API: /api/${spec.path}
//   GET  — list records
//   POST — create a new record
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const VIEW_PERM = PERMISSIONS.${spec.auditPrefix.replace(/_CREATED|_UPDATED|_DELETED/g, "")}_VIEW;
const MANAGE_PERM = PERMISSIONS.${spec.auditPrefix.replace(/_CREATED|_UPDATED|_DELETED/g, "")}_MANAGE ||
  PERMISSIONS.${spec.auditPrefix.replace(/_CREATED|_UPDATED|_DELETED/g, "")}_VIEW;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, VIEW_PERM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const facilityId = url.searchParams.get("facilityId");
  const search = url.searchParams.get("search");
  const limit = parseInt(url.searchParams.get("limit") || "200");

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

  // Apply any filter params from URL
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
    // OR search across known fields - use a safe approach
    where.OR = [
      { ${(spec.requiredFields[0] || "id")}: { contains: search, mode: "insensitive" } },
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
  if (!hasPermission(session, MANAGE_PERM)) {
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

const VIEW_PERM = PERMISSIONS.${spec.auditPrefix.replace(/_CREATED|_UPDATED|_DELETED/g, "")}_VIEW;
const MANAGE_PERM = PERMISSIONS.${spec.auditPrefix.replace(/_CREATED|_UPDATED|_DELETED/g, "")}_MANAGE ||
  PERMISSIONS.${spec.auditPrefix.replace(/_CREATED|_UPDATED|_DELETED/g, "")}_VIEW;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, VIEW_PERM)) {
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
  if (!hasPermission(session, MANAGE_PERM)) {
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

  // Convert date strings to Date objects for known date fields
  for (const [k, v] of Object.entries(updateData)) {
    if (v && typeof v === "string" && (k.endsWith("Date") || k.endsWith("At") || k === "dateOfDeath" || k === "dob" || k === "deceasedDob" || k === "followUpDate" || k === "nextAppointment" || k === "reviewDate" || k === "filingDate" || k === "courtDate" || k === "ethicsApprovalDate" || k === "startDate" || k === "endDate" || k === "remediationDueDate" || k === "remediationAt" || k === "deferralUntil" || k === "collectedAt" || k === "reportedAt" || k === "admittedAt" || k === "dischargedAt" || k === "scheduledAt" || k === "startedAt" || k === "completedAt" || k === "arrivedAt" || k === "departedAt" || k === "nextVisitDate" || k === "actualStart" || k === "actualEnd" || k === "resolvedAt" || k === "closedAt" || k === "startTime" || k === "endTime")) {
      try {
        updateData[k] = new Date(v);
      } catch {}
    }
  }

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
    oldValues: { status: existing.status || existing.admissionStatus },
    newValues: updateData,
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, MANAGE_PERM)) {
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

// Map audit prefix to actual permission constant name
const PERM_CONST_MAP: Record<string, { view: string; manage: string }> = {
  BLOOD_DONOR: { view: "BLOODBANK_VIEW", manage: "BLOODBANK_MANAGE" },
  BLOOD_UNIT: { view: "BLOODBANK_VIEW", manage: "BLOODBANK_MANAGE" },
  BLOOD_TRANSFUSION: { view: "BLOODBANK_VIEW", manage: "BLOODBANK_TRANSFUSE" },
  THEATRE_CASE: { view: "THEATRE_VIEW", manage: "THEATRE_MANAGE" },
  CRITICAL_CARE: { view: "CRITICAL_CARE_VIEW", manage: "CRITICAL_CARE_MANAGE" },
  SPECIALTY_ENCOUNTER: { view: "SPECIALTY_VIEW", manage: "SPECIALTY_MANAGE" },
  SERVICE_REQUEST: { view: "SUPPORT_SERVICES_VIEW", manage: "SUPPORT_SERVICES_MANAGE" },
  PATIENT_FEEDBACK: { view: "PATIENT_RELATIONS_VIEW", manage: "PATIENT_RELATIONS_MANAGE" },
  QUALITY_INDICATOR: { view: "QA_VIEW", manage: "QA_MANAGE" },
  RISK_REGISTER: { view: "RISK_VIEW", manage: "RISK_MANAGE" },
  LEGAL_CASE: { view: "LEGAL_VIEW", manage: "LEGAL_MANAGE" },
  RESEARCH_STUDY: { view: "RESEARCH_VIEW", manage: "RESEARCH_MANAGE" },
  PR_ACTIVITY: { view: "PR_VIEW", manage: "PR_MANAGE" },
  IT_TICKET: { view: "IT_VIEW", manage: "IT_MANAGE" },
  CODING_RECORD: { view: "CODING_VIEW", manage: "CODING_MANAGE" },
  COMMUNITY_OUTREACH: { view: "COMMUNITY_HEALTH_VIEW", manage: "COMMUNITY_HEALTH_MANAGE" },
  HOME_CARE_VISIT: { view: "HOME_CARE_VIEW", manage: "HOME_CARE_MANAGE" },
  HISTOPATHOLOGY_SPECIMEN: { view: "HISTOPATHOLOGY_VIEW", manage: "HISTOPATHOLOGY_MANAGE" },
  RECOVERY_RECORD: { view: "RECOVERY_VIEW", manage: "RECOVERY_MANAGE" },
  AUDIT_FINDING: { view: "AUDIT_VIEW", manage: "AUDIT_MANAGE" },
};

// Regenerate all files with corrected code
let count = 0;
for (const spec of SPECS) {
  const permInfo = PERM_CONST_MAP[spec.auditPrefix];
  if (!permInfo) {
    console.error(`No perm mapping for ${spec.auditPrefix}`);
    continue;
  }

  const dir = path.join(ROOT, spec.path);
  const listFile = path.join(dir, "route.ts");
  const idFile = path.join(dir, "[id]", "route.ts");

  const listContent = fs.readFileSync(listFile, "utf8");

  // Replace the VIEW_PERM and MANAGE_PERM lines with correct constants
  const fixedList = listContent
    .replace(/const VIEW_PERM = PERMISSIONS\.[A-Z_]+_VIEW;/, `const VIEW_PERM = PERMISSIONS.${permInfo.view};`)
    .replace(/const MANAGE_PERM = PERMISSIONS\.[A-Z_]+_MANAGE\s*\|\|\s*PERMISSIONS\.[A-Z_]+_VIEW;/, `const MANAGE_PERM = PERMISSIONS.${permInfo.manage};`)
    // Fix validation: !fullName -> body.fullName === undefined || ...
    .replace(/if \(([^)]+)\) \{\s*return NextResponse\.json\(\{ error: "Missing required fields: ([^"]+)" \}, \{ status: 400 \}\);\s*\}/, (match, condition, names) => {
      const fields = names.split(", ").map((n: string) => n.trim());
      const newCond = fields.map((f: string) => `body.${f} === undefined || body.${f} === "" || body.${f} === null`).join(" || ");
      return `if (${newCond}) {\n    return NextResponse.json({ error: "Missing required fields: ${names}" }, { status: 400 });\n  }`;
    })
    // Fix duplicate keys: remove the duplicate facilityId and organizationId lines after ...body
    .replace(
      /data: \{\s*organizationId: session\.user\.organizationId,\s*facilityId: resolvedFacilityId,\s*(?:donorNumber|unitNumber|transfusionNumber|caseNumber|admissionNumber|encounterNumber|requestNumber|feedbackNumber|indicatorCode|riskNumber|caseNumber|studyNumber|activityNumber|ticketNumber|eventNumber|visitNumber|specimenNumber|recordNumber|findingNumber),?\s*\.\.\.body,\s*facilityId: resolvedFacilityId,\s*organizationId: session\.user\.organizationId,\s*createdById: session\.user\.id,\s*\},/,
      (match, ...args) => {
        // Extract the number field from the original match
        const numberFieldMatch = match.match(/(donorNumber|unitNumber|transfusionNumber|caseNumber|admissionNumber|encounterNumber|requestNumber|feedbackNumber|indicatorCode|riskNumber|studyNumber|activityNumber|ticketNumber|eventNumber|visitNumber|specimenNumber|recordNumber|findingNumber)/);
        const numberField = numberFieldMatch ? numberFieldMatch[1] : null;
        return `data: {
      ...createData,
      organizationId: session.user.organizationId,
      facilityId: resolvedFacilityId,${numberField ? `\n      ${numberField},` : ""}
      createdById: session.user.id,
    },`;
      }
    )
    // Fix createData destructuring - the current code destructures from body, which is fine
    // But we need to also make sure the destructuring comes BEFORE the data
    .replace(
      /let resolvedFacilityId = body\.facilityId \|\| session\.user\.facilityId \|\| null;[\s\S]*?const \{ id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, createdById: _cb, facilityId: _fId, \.\.\.createData \} = body;[\s\S]*?const item = await db\./,
      (match) => {
        return `let resolvedFacilityId = body.facilityId || session.user.facilityId || null;
  if (resolvedFacilityId) {
    const f = await db.facility.findUnique({ where: { id: resolvedFacilityId } });
    if (!f || f.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Invalid facility" }, { status: 400 });
    }
  }

  // Strip protected fields from body before passing to prisma.create
  const { id: _id, organizationId: _orgId, createdAt: _c, updatedAt: _u, createdById: _cb, facilityId: _fId, ...createData } = body;

  const item = await db.`;
    }
    );

  fs.writeFileSync(listFile, fixedList);

  // Fix ID route file
  const idContent = fs.readFileSync(idFile, "utf8");
  const fixedId = idContent
    .replace(/const VIEW_PERM = PERMISSIONS\.[A-Z_]+_VIEW;/, `const VIEW_PERM = PERMISSIONS.${permInfo.view};`)
    .replace(/const MANAGE_PERM = PERMISSIONS\.[A-Z_]+_MANAGE\s*\|\|\s*PERMISSIONS\.[A-Z_]+_VIEW;/, `const MANAGE_PERM = PERMISSIONS.${permInfo.manage};`);

  fs.writeFileSync(idFile, fixedId);

  count += 2;
}

console.log(`Fixed ${count} route files`);

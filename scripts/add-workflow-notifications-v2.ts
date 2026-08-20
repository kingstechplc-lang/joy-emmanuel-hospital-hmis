// Fix workflow notification insertion — previous script had a regex bug
import * as fs from "fs";
import * as path from "path";

const ROOT = "/home/z/my-project/src/app/api";

interface Spec {
  path: string;
  importLine: string;
  notifyCall: string;
}

const SPECS: Spec[] = [
  {
    path: "theatre",
    importLine: `import { notifyTheatreCaseScheduled } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to theatre staff
  await notifyTheatreCaseScheduled({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    caseNumber: item.caseNumber,
    patientName: item.patientName,
    procedureName: item.procedureName,
    scheduledStart: item.scheduledStart,
    surgeonName: item.surgeonName || undefined,
    theatreCaseId: item.id,
  });`,
  },
  {
    path: "critical-care",
    importLine: `import { notifyCriticalCareAdmitted } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to ICU/NICU staff
  await notifyCriticalCareAdmitted({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    admissionNumber: item.admissionNumber,
    patientName: item.patientName,
    unitType: item.unitType,
    diagnosis: item.admittingDiagnosis,
    severity: item.severity || undefined,
    criticalCareId: item.id,
    attendingPhysicianId: item.attendingPhysicianId || undefined,
  });`,
  },
  {
    path: "service-requests",
    importLine: `import { notifyServiceRequestCreated } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to support services staff
  await notifyServiceRequestCreated({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    requestNumber: item.requestNumber,
    serviceType: item.serviceType,
    title: item.title,
    location: item.location || undefined,
    priority: item.priority || undefined,
    requestId: item.id,
    requestedById: session.user.id,
  });`,
  },
  {
    path: "patient-feedback",
    importLine: `import { notifyPatientFeedbackReceived } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to patient relations staff
  await notifyPatientFeedbackReceived({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    feedbackNumber: item.feedbackNumber,
    feedbackType: item.feedbackType,
    patientName: item.patientName,
    subject: item.subject,
    severity: item.severity || undefined,
    feedbackId: item.id,
  });`,
  },
  {
    path: "it-tickets",
    importLine: `import { notifyItTicketCreated } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to IT support staff
  await notifyItTicketCreated({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    ticketNumber: item.ticketNumber,
    ticketType: item.ticketType,
    subject: item.subject,
    priority: item.priority,
    ticketId: item.id,
    reportedById: session.user.id,
  });`,
  },
  {
    path: "home-care",
    importLine: `import { notifyHomeCareVisitScheduled } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to home care staff
  await notifyHomeCareVisitScheduled({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    visitNumber: item.visitNumber,
    patientName: item.patientName,
    visitType: item.visitType,
    scheduledAt: item.scheduledAt,
    visitId: item.id,
    caregiverId: item.caregiverId || undefined,
  });`,
  },
];

let count = 0;
for (const spec of SPECS) {
  const file = path.join(ROOT, spec.path, "route.ts");
  let content = fs.readFileSync(file, "utf8");

  // Skip if notifyCall already present
  if (content.includes("Fire workflow notification")) {
    console.log(`Already has notify call: ${spec.path}`);
    continue;
  }

  // Ensure import is there
  if (!content.includes("@/lib/workflow-notifications")) {
    content = content.replace(
      /(import { apiRouteConfig } from "@\/lib\/api-route-config";)/,
      `$1\n${spec.importLine}`
    );
  }

  // Find the LAST occurrence of `  return NextResponse.json({ item }, { status: 201 });`
  // and insert notifyCall before it
  const target = "  return NextResponse.json({ item }, { status: 201 });";
  const lastIdx = content.lastIndexOf(target);
  if (lastIdx === -1) {
    console.log(`Could not find return statement in ${spec.path}`);
    continue;
  }
  content = content.slice(0, lastIdx) + spec.notifyCall + "\n\n" + content.slice(lastIdx);

  fs.writeFileSync(file, content);
  count++;
  console.log(`Patched: ${spec.path}`);
}

console.log(`\nDone — patched ${count} files`);

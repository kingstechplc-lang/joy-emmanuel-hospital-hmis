// Patch remaining extended module API routes with workflow notifications
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
    path: "blood-bank/donors",
    importLine: `import { sendWorkflowNotification } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to blood bank staff
  await sendWorkflowNotification({
    event: "blood_unit_reserved",
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    title: \`🩸 New Donor Registered: \${item.donorNumber}\`,
    message: \`\${item.fullName} — Blood Group: \${item.bloodGroup || "Unknown"}\`,
    referenceType: "blood_donor",
    referenceId: item.id,
  });`,
  },
  {
    path: "blood-bank/units",
    importLine: `import { notifyBloodUnitIssued } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to blood bank + clinical staff
  await sendWorkflowNotification({
    event: "blood_unit_reserved",
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    title: \`🩸 New Blood Unit: \${item.unitNumber}\`,
    message: \`\${item.bloodGroup} (\${item.componentType}) — \${item.volumeMl}ml. Expiry: \${new Date(item.expiryDate).toLocaleDateString()}\`,
    referenceType: "blood_unit",
    referenceId: item.id,
  });`,
  },
  {
    path: "blood-bank/transfusions",
    importLine: `import { notifyBloodTransfusionStarted } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification — transfusion started
  await notifyBloodTransfusionStarted({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    transfusionNumber: item.transfusionNumber,
    patientName: item.patientName,
    bloodGroup: item.bloodGroup,
    volumeMl: item.volumeMl,
    transfusionId: item.id,
    administeredById: item.administeredById || undefined,
  });`,
  },
  {
    path: "specialty",
    importLine: `import { notifySpecialtyEncounterCreated } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to specialty clinicians
  await notifySpecialtyEncounterCreated({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    encounterNumber: item.encounterNumber,
    patientName: item.patientName,
    departmentCode: item.departmentCode,
    chiefComplaint: item.chiefComplaint,
    encounterId: item.id,
    clinicianId: item.clinicianId || undefined,
  });`,
  },
  {
    path: "coding-records",
    importLine: `import { notifyCodingRecordCreated } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to coding/claims staff
  await notifyCodingRecordCreated({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    patientName: item.patientName,
    codingType: item.codingType,
    primaryCode: item.primaryCode,
    primaryDescription: item.primaryDescription,
    codingId: item.id,
    coderId: session.user.id,
  });`,
  },
  {
    path: "community-outreach",
    importLine: `import { notifyCommunityOutreachScheduled } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to community health staff
  await notifyCommunityOutreachScheduled({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    eventNumber: item.eventNumber,
    eventType: item.eventType,
    title: item.title,
    location: item.location,
    startDate: item.startDate,
    eventId: item.id,
    teamLeadId: item.teamLeadId || undefined,
  });`,
  },
  {
    path: "histopathology",
    importLine: `import { notifyHistopathologySpecimenCreated } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to histopathology staff
  await notifyHistopathologySpecimenCreated({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    specimenNumber: item.specimenNumber,
    patientName: item.patientName,
    specimenType: item.specimenType,
    specimenSite: item.specimenSite,
    specimenId: item.id,
    requestingPhysicianId: item.requestingPhysicianId || undefined,
  });`,
  },
  {
    path: "recovery-room",
    importLine: `import { notifyRecoveryRoomAdmitted } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to recovery room staff
  await notifyRecoveryRoomAdmitted({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    recordNumber: item.recordNumber,
    patientName: item.patientName,
    theatreCaseNumber: item.theatreCaseNumber || undefined,
    recoveryId: item.id,
    nurseId: item.nurseId || undefined,
  });`,
  },
  {
    path: "audit-findings",
    importLine: `import { notifyAuditFindingCreated } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to audit/governance staff
  await notifyAuditFindingCreated({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    findingNumber: item.findingNumber,
    auditType: item.auditType,
    title: item.title,
    severity: item.severity,
    findingId: item.id,
    auditorId: session.user.id,
  });`,
  },
  {
    path: "quality-indicators",
    importLine: `import { notifyQualityIndicatorCreated } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to QA staff
  await notifyQualityIndicatorCreated({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    indicatorCode: item.indicatorCode,
    indicatorName: item.indicatorName,
    category: item.category || "general",
    target: item.target || "—",
    indicatorId: item.id,
  });`,
  },
  {
    path: "risk-register",
    importLine: `import { notifyRiskRegisterCreated } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to risk/governance staff
  await notifyRiskRegisterCreated({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    riskNumber: item.riskNumber,
    riskTitle: item.riskTitle,
    riskCategory: item.riskCategory || "operational",
    likelihood: item.likelihood || "medium",
    impact: item.impact || "medium",
    riskId: item.id,
    ownerId: item.ownerId || undefined,
  });`,
  },
  {
    path: "legal-cases",
    importLine: `import { notifyLegalCaseCreated } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to legal/governance staff
  await notifyLegalCaseCreated({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    caseNumber: item.caseNumber,
    caseType: item.caseType,
    title: item.title,
    priority: item.priority || "medium",
    caseId: item.id,
    assignedAttorney: item.assignedAttorney || undefined,
  });`,
  },
  {
    path: "research",
    importLine: `import { notifyResearchStudyCreated } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to research staff
  await notifyResearchStudyCreated({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    studyNumber: item.studyNumber,
    studyTitle: item.studyTitle,
    studyType: item.studyType || "observational",
    principalInvestigator: item.principalInvestigator || "—",
    studyId: item.id,
  });`,
  },
  {
    path: "pr-activities",
    importLine: `import { notifyPRActivityCreated } from "@/lib/workflow-notifications";`,
    notifyCall: `  // 🔔 Fire workflow notification to PR staff
  await notifyPRActivityCreated({
    organizationId: session.user.organizationId,
    facilityId: resolvedFacilityId,
    activityNumber: item.activityNumber,
    activityType: item.activityType,
    title: item.title,
    status: item.status,
    activityId: item.id,
  });`,
  },
];

let count = 0;
for (const spec of SPECS) {
  const file = path.join(ROOT, spec.path, "route.ts");
  if (!fs.existsSync(file)) {
    console.log(`Skipping ${file} — does not exist`);
    continue;
  }

  let content = fs.readFileSync(file, "utf8");

  // Skip if already patched
  if (content.includes("Fire workflow notification")) {
    console.log(`Already patched: ${spec.path}`);
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

// =====================================================================
// API: /api/seed-certification-defaults — POST
//   Seeds default certification types and issuers.
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const DEFAULT_CERT_TYPES = [
  { name: "Basic Life Support (BLS)", code: "BLS", category: "Clinical", credentialType: "certification", isMandatory: true, defaultValidityMonths: 24, requiresVerification: true, requiresApproval: true },
  { name: "Advanced Cardiac Life Support (ACLS)", code: "ACLS", category: "Clinical", credentialType: "certification", isMandatory: false, defaultValidityMonths: 24, requiresVerification: true, requiresApproval: true },
  { name: "First Aid Certification", code: "FIRST-AID", category: "Clinical", credentialType: "certification", isMandatory: false, defaultValidityMonths: 36, requiresVerification: true, requiresApproval: true },
  { name: "Infection Control Certification", code: "IPC-CERT", category: "Infection Prevention", credentialType: "certification", isMandatory: true, defaultValidityMonths: 12, requiresVerification: true, requiresApproval: true },
  { name: "Fire Safety Certification", code: "FIRE-SAFETY-CERT", category: "Safety", credentialType: "certification", isMandatory: true, defaultValidityMonths: 12, requiresVerification: true, requiresApproval: true },
  { name: "Occupational Safety Certification", code: "OHS-CERT", category: "Occupational Health", credentialType: "certification", isMandatory: true, defaultValidityMonths: 12, requiresVerification: true, requiresApproval: true },
  { name: "Medical License", code: "MED-LICENSE", category: "Professional", credentialType: "professional_license", isMandatory: true, defaultValidityMonths: 12, requiresVerification: true, requiresApproval: true },
  { name: "Nursing License", code: "NURSE-LICENSE", category: "Professional", credentialType: "professional_license", isMandatory: true, defaultValidityMonths: 12, requiresVerification: true, requiresApproval: true },
  { name: "Pharmacy License", code: "PHARM-LICENSE", category: "Professional", credentialType: "professional_license", isMandatory: true, defaultValidityMonths: 12, requiresVerification: true, requiresApproval: true },
  { name: "Laboratory License", code: "LAB-LICENSE", category: "Professional", credentialType: "professional_license", isMandatory: true, defaultValidityMonths: 12, requiresVerification: true, requiresApproval: true },
  { name: "Radiology License", code: "RADIO-LICENSE", category: "Professional", credentialType: "professional_license", isMandatory: true, defaultValidityMonths: 12, requiresVerification: true, requiresApproval: true },
  { name: "Data Protection Certification", code: "DATA-PROT", category: "Regulatory", credentialType: "certification", isMandatory: true, defaultValidityMonths: 12, requiresVerification: true, requiresApproval: true },
  { name: "Cybersecurity Certification", code: "CYBER-CERT", category: "IT", credentialType: "certification", isMandatory: false, defaultValidityMonths: 12, requiresVerification: true, requiresApproval: true },
  { name: "Emergency Care Certification", code: "EMERGENCY-CERT", category: "Emergency", credentialType: "certification", isMandatory: true, defaultValidityMonths: 24, requiresVerification: true, requiresApproval: true },
  { name: "Medical Ethics Certification", code: "ETHICS-CERT", category: "Regulatory", credentialType: "certification", isMandatory: true, defaultValidityMonths: 36, requiresVerification: true, requiresApproval: true },
];

const DEFAULT_ISSUERS = [
  { name: "Medical and Dental Council", type: "government", country: "Ghana", verificationUrl: null },
  { name: "Nursing and Midwifery Council of Ghana", type: "government", country: "Ghana" },
  { name: "Pharmacy Council of Ghana", type: "government", country: "Ghana" },
  { name: "Allied Health Professions Council", type: "government", country: "Ghana" },
  { name: "American Heart Association", type: "professional_body", country: "USA" },
  { name: "Red Cross Society", type: "professional_body", country: "International" },
  { name: "World Health Organization", type: "international", country: "International" },
  { name: "Ministry of Health", type: "government", country: "Ghana" },
];

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CERTIFICATION_REQUIREMENT_MANAGE) && !hasPermission(session, PERMISSIONS.SHIFT_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = session.user.organizationId;
  const results = { typesCreated: 0, typesSkipped: 0, issuersCreated: 0, issuersSkipped: 0 };

  for (const t of DEFAULT_CERT_TYPES) {
    const existing = await db.certificationType.findUnique({ where: { organizationId_code: { organizationId: orgId, code: t.code } } });
    if (existing) { results.typesSkipped++; continue; }
    await db.certificationType.create({
      data: {
        organizationId: orgId,
        name: t.name, code: t.code, category: t.category,
        credentialType: t.credentialType,
        isMandatory: t.isMandatory,
        defaultValidityMonths: t.defaultValidityMonths,
        requiresVerification: t.requiresVerification,
        requiresApproval: t.requiresApproval,
        allowsExpiry: true,
      },
    });
    results.typesCreated++;
  }

  for (const i of DEFAULT_ISSUERS) {
    const existing = await db.certificationIssuer.findFirst({ where: { organizationId: orgId, name: i.name } });
    if (existing) { results.issuersSkipped++; continue; }
    await db.certificationIssuer.create({
      data: {
        organizationId: orgId,
        name: i.name, type: i.type, country: i.country,
        verificationUrl: i.verificationUrl || null,
      },
    });
    results.issuersCreated++;
  }

  await auditLog({ userId: session.user.id, organizationId: orgId, action: "CERTIFICATION_DEFAULTS_SEEDED", resourceType: "organization", resourceId: orgId, newValues: results });
  return NextResponse.json({ ok: true, results });
}

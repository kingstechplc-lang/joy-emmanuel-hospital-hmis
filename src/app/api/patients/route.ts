// =====================================================================
// API: /api/patients
//   GET    — search patients (by number, name, phone, ghana card, etc.)
//   POST   — create new patient (with duplicate detection)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, auditLog, nextPatientNumber, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { validateGhanaCard, validateGhanaPhone } from "@/lib/ghana-validation";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

// GET /api/patients?q=...&facilityId=...&limit=50
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const status = url.searchParams.get("status");

  // If query looks like a patient number, do exact match
  const where: any = { organizationId: session.user.organizationId };
  if (status) where.status = status;
  else where.status = { in: ["active", "merged"] };

  if (q) {
    // Patient is organization-level; we search across the whole org
    const OR: any[] = [
      { patientNumber: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { phone: { contains: q } },
      { alternativePhone: { contains: q } },
      { email: { contains: q } },
    ];

    // Also search by identifier value (ghana card, insurance #, etc.)
    OR.push({
      identifiers: { some: { identifierValue: { contains: q } } },
    });

    where.OR = OR;
  }

  const patients = await db.patient.findMany({
    where,
    orderBy: { registrationDate: "desc" },
    take: limit,
    include: {
      identifiers: { take: 3, orderBy: { isPrimary: "desc" } },
      _count: {
        select: { encounters: true, allergies: true, prescriptions: true, labOrders: true, invoices: true },
      },
    },
  });

  return NextResponse.json({ patients, count: patients.length });
}

// POST /api/patients
// Body: { firstName, lastName, dateOfBirth, sex, phone, ghanaCard, ... }
// The endpoint performs duplicate detection first.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.PATIENT_CREATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }
  const {
    firstName, middleName, lastName, previousName,
    dateOfBirth, sex, gender, maritalStatus, nationality, occupation,
    phone, alternativePhone, email, address, city, region, district, country,
    preferredLanguage, bloodGroup,
    // Identifiers
    ghanaCard, passport, insuranceNumber, insuranceProviderId, membershipNumber, policyNumber,
    principalMember, relationshipToPrincipal, coverageStart, coverageEnd,
    // Contacts — Emergency Contact
    emergencyContactName, emergencyContactRelationship, emergencyContactRelationshipOther,
    emergencyContactPhone, emergencyContactAltPhone, emergencyContactAddress,
    // Contacts — Next of Kin
    nextOfKinName, nextOfKinRelationship, nextOfKinRelationshipOther,
    nextOfKinPhone, nextOfKinAltPhone, nextOfKinAddress,
    registeredAtFacilityId,
    force,
  } = body;

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "First name and last name are required" }, { status: 400 });
  }

  // === SERVER-SIDE VALIDATION (defense-in-depth) ===
  // Validate Ghana Card format if provided
  if (ghanaCard) {
    const ghResult = validateGhanaCard(ghanaCard);
    if (!ghResult.valid) {
      return NextResponse.json({ error: ghResult.error || "Invalid Ghana Card format" }, { status: 400 });
    }
  }

  // Validate DOB is not in the future
  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    if (dob > new Date()) {
      return NextResponse.json({ error: "Date of birth cannot be in the future" }, { status: 400 });
    }
  }

  // Validate email format if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
  }

  // === NORMALIZE PHONE NUMBERS ===
  const normalizedPhone = phone ? validateGhanaPhone(phone).normalized : null;
  const normalizedAltPhone = alternativePhone ? validateGhanaPhone(alternativePhone).normalized : null;
  const normalizedEmergencyPhone = emergencyContactPhone ? validateGhanaPhone(emergencyContactPhone).normalized : null;
  const normalizedEmergencyAltPhone = emergencyContactAltPhone ? validateGhanaPhone(emergencyContactAltPhone).normalized : null;
  const normalizedNokPhone = nextOfKinPhone ? validateGhanaPhone(nextOfKinPhone).normalized : null;
  const normalizedNokAltPhone = nextOfKinAltPhone ? validateGhanaPhone(nextOfKinAltPhone).normalized : null;
  const normalizedGhanaCard = ghanaCard ? validateGhanaCard(ghanaCard).normalized : null;

  // Use normalized values in duplicate detection + creation
  const normalizedMembershipNumber = membershipNumber?.trim() || null;

  const orgId = session.user.organizationId;
  const facilityId = registeredAtFacilityId || session.user.facilityId;

  // === DUPLICATE DETECTION ===
  // Check by Ghana Card, phone, name+DOB, and insurance number
  const matches: any[] = [];

  if (normalizedGhanaCard && !force) {
    const m = await db.patientIdentifier.findFirst({
      where: { identifierType: "ghana_card", identifierValue: normalizedGhanaCard },
      include: { patient: true },
    });
    if (m && m.patient.organizationId === orgId && m.patient.status === "active") {
      matches.push({ matchType: "Ghana Card", patient: m.patient });
    }
  }

  if (normalizedPhone && !force) {
    const m = await db.patient.findFirst({
      where: { organizationId: orgId, phone: normalizedPhone, status: "active" },
    });
    if (m) matches.push({ matchType: "Phone", patient: m });
  }

  if (firstName && lastName && dateOfBirth && !force) {
    const dobDate = new Date(dateOfBirth);
    const m = await db.patient.findFirst({
      where: {
        organizationId: orgId,
        firstName: { contains: firstName },
        lastName: { contains: lastName },
        dateOfBirth: dobDate,
        status: "active",
      },
    });
    if (m) matches.push({ matchType: "Name + DOB", patient: m });
  }

  if (normalizedMembershipNumber && !force) {
    const m = await db.patientInsurance.findFirst({
      where: { membershipNumber: normalizedMembershipNumber },
      include: { patient: true },
    });
    if (m && m.patient.organizationId === orgId && m.patient.status === "active") {
      matches.push({ matchType: "Insurance Number", patient: m.patient });
    }
  }

  // If duplicates found, return them WITHOUT creating
  if (matches.length > 0) {
    return NextResponse.json({
      duplicates: matches.map((m) => ({
        matchType: m.matchType,
        patient: {
          id: m.patient.id,
          patientNumber: m.patient.patientNumber,
          firstName: m.patient.firstName,
          lastName: m.patient.lastName,
          dateOfBirth: m.patient.dateOfBirth,
          sex: m.patient.sex,
          phone: m.patient.phone,
        },
      })),
      message: "Possible duplicate patient found. Please review before creating a new record.",
    }, { status: 409 });
  }

  // === CREATE PATIENT ===
  const patientNumber = await nextPatientNumber(orgId);

  // Compose the relationship strings (include "Other" description if applicable)
  const finalEmergencyRelationship = emergencyContactRelationship === "Other"
    ? (emergencyContactRelationshipOther || "Other")
    : (emergencyContactRelationship || null);
  const finalNokRelationship = nextOfKinRelationship === "Other"
    ? (nextOfKinRelationshipOther || "Other")
    : (nextOfKinRelationship || null);

  // Compose the address line (include district if provided)
  const finalAddress = address || null;
  const finalCity = city || district || null; // use district as city if city is empty

  const patient = await db.patient.create({
    data: {
      organizationId: orgId,
      patientNumber,
      firstName,
      middleName: middleName || null,
      lastName,
      previousName: previousName || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      sex: sex || null,
      gender: gender || null,
      maritalStatus: maritalStatus || null,
      nationality: nationality || "Ghanaian",
      occupation: occupation || null,
      phone: normalizedPhone,
      alternativePhone: normalizedAltPhone,
      email: email || null,
      address: finalAddress,
      city: finalCity,
      region: region || null,
      country: country || "Ghana",
      preferredLanguage: preferredLanguage || "en",
      bloodGroup: bloodGroup || null,
      status: "active",
      registeredAtFacilityId: facilityId,
      registeredBy: session.user.id,
      registrationDate: new Date(),
    },
  });

  // Identifiers
  if (normalizedGhanaCard) {
    await db.patientIdentifier.create({
      data: {
        patientId: patient.id,
        identifierType: "ghana_card",
        identifierValue: normalizedGhanaCard,
        isPrimary: true,
        verified: true,
        verifiedAt: new Date(),
      },
    });
  }
  if (passport) {
    await db.patientIdentifier.create({
      data: {
        patientId: patient.id,
        identifierType: "passport",
        identifierValue: passport,
        isPrimary: !normalizedGhanaCard,
      },
    });
  }

  // Insurance
  if (insuranceProviderId && (normalizedMembershipNumber || policyNumber)) {
    await db.patientInsurance.create({
      data: {
        patientId: patient.id,
        insuranceProviderId,
        membershipNumber: normalizedMembershipNumber,
        policyNumber: policyNumber || null,
        principalMember: principalMember || `${firstName} ${lastName}`,
        relationshipToPrincipal: relationshipToPrincipal || "self",
        coverageStart: coverageStart ? new Date(coverageStart) : new Date(),
        coverageEnd: coverageEnd ? new Date(coverageEnd) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        verificationStatus: "pending",
        status: "active",
      },
    });
  }

  // Emergency contact (with expanded fields)
  if (emergencyContactName) {
    await db.emergencyContact.create({
      data: {
        patientId: patient.id,
        name: emergencyContactName,
        relationship: finalEmergencyRelationship,
        phone: normalizedEmergencyPhone,
        alternativePhone: normalizedEmergencyAltPhone,
        address: emergencyContactAddress || null,
        isPrimary: true,
      },
    });
  }

  // Next of kin (with expanded fields)
  if (nextOfKinName) {
    await db.nextOfKin.create({
      data: {
        patientId: patient.id,
        name: nextOfKinName,
        relationship: finalNokRelationship,
        phone: normalizedNokPhone,
        alternativePhone: normalizedNokAltPhone,
        address: nextOfKinAddress || null,
        isPrimary: true,
      },
    });
  }

  await auditLog({
    userId: session.user.id,
    organizationId: orgId,
    facilityId: facilityId || undefined,
    action: "PATIENT_CREATED",
    resourceType: "patient",
    resourceId: patient.id,
    newValues: { patientNumber, firstName, lastName, sex, phone: normalizedPhone },
  });

  return NextResponse.json({ patient }, { status: 201 });
}

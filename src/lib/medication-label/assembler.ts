// =====================================================================
// MEDICATION LABEL — Content Assembler + QR Token Generator
// =====================================================================
// Builds the structured content payload used by both the on-screen
// label preview and the thermal-printer template. Also generates the
// opaque label token (crypto.randomUUID) that bedside staff scan via
// QR to verify the 5 Rights of medication administration:
//   1. Right patient
//   2. Right drug
//   3. Right dose
//   4. Right route
//   5. Right time (frequency / duration)
//
// The QR payload encodes `${origin}/ml/<token>` so any modern
// smartphone / tablet / handheld scanner can:
//   - Open the link in a browser, OR
//   - Hand the URL string to a backend lookup
//
// Token format: `/ml/<token>` — short prefix keeps QR small (better
// scanning), and the token is opaque (NOT the patientId or
// prescriptionItemId) to prevent leaking internal IDs through QR scans.
//
// Data sources (all read-only):
//   - PrescriptionItem → Medication (genericName, brandName, strength,
//     dosageForm, route, nhisCode, isHighAlert, controlledStatus,
//     pregnancyCategory, storageConditions, manufacturer, countryOfOrigin,
//     atcCode)
//   - Prescription (prescriptionNumber, prescribedAt, prescriberId → User
//     + Staff for licenseNumber/professionalRegistrationNumber)
//   - Patient (patientNumber MRN, firstName, lastName, dateOfBirth,
//     sex, bloodGroup, allergies for cross-check)
//   - InventoryBatch (batchNumber / lot, expiryDate, sellingPrice)
//     — chosen at dispense time
//   - InventoryItem (barcode / GTIN) via FacilityInventory
//   - Facility + Organization (name, code, phone, logoUrl)
//
// Allergies are NOT rendered as a banner on the medication label
// (they're a property of the patient, not the medication). Instead
// they're returned in the content so the print button can show a
// warning if the medication being labeled is in the patient's active
// allergy list — the pharmacist can review before printing.
// =====================================================================

import { db } from "@/lib/db";

export interface MedicationLabelContent {
  patient: {
    id: string;
    patientNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    dateOfBirth?: string | null;
    age: number | null;
    sex?: string | null;
    bloodGroup?: string | null;
  };
  prescription?: {
    id: string;
    prescriptionNumber: string;
    prescribedAt: string;
    prescriber?: {
      id: string;
      firstName: string;
      lastName: string;
      fullName: string;
      professionalRole?: string | null;
      licenseNumber?: string | null;
      professionalRegistrationNumber?: string | null;
      licensingAuthority?: string | null;
    } | null;
  };
  prescriptionItem: {
    id: string;
    dose?: string | null;
    frequency?: string | null;
    route?: string | null;
    duration?: string | null;
    durationValue?: number | null;
    durationUnit?: string | null;
    quantity: number;
    dispensedQuantity: number;
    instructions?: string | null;
    isPRN: boolean;
    isSTAT: boolean;
    prnIndication?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    diagnosisId?: string | null;
  };
  medication: {
    id: string;
    genericName: string;
    brandName?: string | null;
    strength?: string | null;
    dosageForm?: string | null;
    route?: string | null;
    therapeuticClass?: string | null;
    atcCode?: string | null;
    nhisCode?: string | null;
    nhisTariffAmount?: number | null;
    nhisPrescribingLevel?: string | null;
    nhisUnitOfPricing?: string | null;
    manufacturer?: string | null;
    countryOfOrigin?: string | null;
    prescriptionStatus?: string | null;
    controlledStatus?: string | null;
    isHighAlert: boolean;
    pregnancyCategory?: string | null;
    lactationSafety?: string | null;
    storageConditions?: string | null;
    barcode?: string | null;
    productCode?: string | null;
  };
  batch?: {
    id: string;
    batchNumber: string;
    expiryDate?: string | null;
    manufactureDate?: string | null;
    sellingPrice?: number | null;
    costPrice?: number | null;
    status: string;
    // Days until expiry (negative if expired)
    daysToExpiry: number | null;
    isExpired: boolean;
    isExpiringSoon: boolean; // <= 30 days
  } | null;
  facility: {
    id: string;
    name: string;
    code?: string | null;
    phone?: string | null;
    logoUrl?: string | null;
  };
  organization: {
    id: string;
    name: string;
    logoUrl?: string | null;
  };
  // Patient's active allergies (for cross-check warning in the print
  // button UI; not rendered on the label itself)
  patientAllergies: Array<{
    id: string;
    allergen: string;
    severity: string | null;
  }>;
  // True if the medication's genericName or brandName matches any of
  // the patient's active allergens (case-insensitive contains). Used
  // to show a red warning in the print modal.
  allergyConflict: boolean;
  allergyConflictDetail: string | null;
  // QR payload — the URL encoded by the QR library
  qrPayload: string;
  // Opaque label token
  token: string;
  // ISO date when the label was minted
  issuedAt: string;
  // How many units were dispensed (from dispensedQuantity)
  dispensedQuantity: number;
}

function calculateAge(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function calculateDaysToExpiry(expiryDate: string | Date | null | undefined): {
  daysToExpiry: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
} {
  if (!expiryDate) return { daysToExpiry: null, isExpired: false, isExpiringSoon: false };
  const d = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
  if (isNaN(d.getTime())) return { daysToExpiry: null, isExpired: false, isExpiringSoon: false };
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.floor((d.getTime() - Date.now()) / msPerDay);
  return {
    daysToExpiry: days,
    isExpired: days < 0,
    isExpiringSoon: days >= 0 && days <= 30,
  };
}

export function generateMedicationLabelToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function buildLabelQrPayload(token: string, origin?: string): string {
  if (origin) {
    return `${origin.replace(/\/$/, "")}/ml/${token}`;
  }
  return `/ml/${token}`;
}

/**
 * Assemble the medication label content for a prescription item (+ optional batch).
 *
 * Read-only — no records are created or modified.
 */
export async function assembleMedicationLabelContent(
  prescriptionItemId: string,
  batchId: string | null | undefined,
  token: string,
  origin?: string,
): Promise<{
  content: MedicationLabelContent;
  organizationId: string;
  facilityId: string;
  patientId: string;
  prescriptionId: string;
  inventoryBatchId: string | null;
}> {
  // 1. Load the prescription item with medication + prescription + patient + prescriber
  const item = await db.prescriptionItem.findUnique({
    where: { id: prescriptionItemId },
    include: {
      medication: true,
      prescription: {
        include: {
          patient: {
            include: {
              allergies: { where: { status: "active" } },
              organization: { select: { id: true, name: true, logoUrl: true } },
            },
          },
          prescriber: {
            include: {
              staff: {
                select: {
                  professionalRole: true,
                  licenseNumber: true,
                  professionalRegistrationNumber: true,
                  licensingAuthority: true,
                },
              },
            },
          },
          facility: {
            select: {
              id: true, name: true, code: true, phone: true,
              organization: { select: { logoUrl: true } },
            },
          },
        },
      },
    },
  });

  if (!item) {
    throw new Error("Prescription item not found");
  }
  if (!item.medication) {
    throw new Error("Medication not found for this prescription item");
  }

  // 2. Load the InventoryBatch (if provided) — this gives us lot + expiry
  let batch: any = null;
  if (batchId) {
    batch = await db.inventoryBatch.findUnique({
      where: { id: batchId },
      include: {
        facilityInventory: {
          include: {
            inventoryItem: {
              select: { id: true, barcode: true, name: true, sku: true },
            },
          },
        },
      },
    });
    if (!batch) {
      throw new Error("Inventory batch not found");
    }
  }

  const p = item.prescription.patient;
  const m = item.medication;
  const prescriber = item.prescription.prescriber;
  const prescriberStaff = prescriber?.staff;
  const facility = item.prescription.facility;
  const organization = p.organization;

  // 3. Determine facility for the label — Prescription.facilityId is always set
  const facilityId = item.prescription.facilityId;

  // 4. Cross-check allergies — if the medication's genericName or
  //    brandName contains an active allergen (case-insensitive),
  //    flag a conflict. The print button UI will show a red warning.
  const patientAllergies = p.allergies.map((a) => ({
    id: a.id,
    allergen: a.allergen,
    severity: a.severity,
  }));
  const genericLower = m.genericName?.toLowerCase() || "";
  const brandLower = m.brandName?.toLowerCase() || "";
  const conflictingAllergy = patientAllergies.find((a) => {
    const allergenLower = a.allergen.toLowerCase();
    return (
      (genericLower && allergenLower.includes(genericLower)) ||
      (genericLower && genericLower.includes(allergenLower)) ||
      (brandLower && allergenLower.includes(brandLower)) ||
      (brandLower && brandLower.includes(allergenLower))
    );
  });

  // 5. Calculate days to expiry for the batch (if any)
  const expiryInfo = batch
    ? calculateDaysToExpiry(batch.expiryDate)
    : { daysToExpiry: null, isExpired: false, isExpiringSoon: false };

  // 6. Build the QR payload URL
  const qrPayload = buildLabelQrPayload(token, origin);

  // 7. Resolve facility logo (from organization.logoUrl, since Facility
  //    has no logoUrl column)
  const facilityLogoUrl = facility?.organization?.logoUrl || organization.logoUrl || null;

  // 8. Get the GTIN barcode from the InventoryItem (via batch → facilityInventory)
  const inventoryItemBarcode = batch?.facilityInventory?.inventoryItem?.barcode || m.barcode || null;

  const content: MedicationLabelContent = {
    patient: {
      id: p.id,
      patientNumber: p.patientNumber,
      firstName: p.firstName,
      lastName: p.lastName,
      fullName: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" "),
      dateOfBirth: p.dateOfBirth?.toISOString() || null,
      age: calculateAge(p.dateOfBirth),
      sex: p.sex,
      bloodGroup: p.bloodGroup,
    },
    prescription: {
      id: item.prescription.id,
      prescriptionNumber: item.prescription.prescriptionNumber,
      prescribedAt: item.prescription.prescribedAt.toISOString(),
      prescriber: prescriber
        ? {
            id: prescriber.id,
            firstName: prescriber.firstName,
            lastName: prescriber.lastName,
            fullName: `${prescriber.firstName} ${prescriber.lastName}`.trim(),
            professionalRole: prescriberStaff?.professionalRole || null,
            licenseNumber: prescriberStaff?.licenseNumber || null,
            professionalRegistrationNumber: prescriberStaff?.professionalRegistrationNumber || null,
            licensingAuthority: prescriberStaff?.licensingAuthority || null,
          }
        : null,
    },
    prescriptionItem: {
      id: item.id,
      dose: item.dose,
      frequency: item.frequency,
      route: item.route,
      duration: item.duration,
      durationValue: item.durationValue,
      durationUnit: item.durationUnit,
      quantity: item.quantity,
      dispensedQuantity: item.dispensedQuantity,
      instructions: item.instructions,
      isPRN: !!item.isPRN,
      isSTAT: !!item.isSTAT,
      prnIndication: item.prnIndication,
      startDate: item.startDate?.toISOString() || null,
      endDate: item.endDate?.toISOString() || null,
      diagnosisId: item.diagnosisId,
    },
    medication: {
      id: m.id,
      genericName: m.genericName,
      brandName: m.brandName,
      strength: m.strength,
      dosageForm: m.dosageForm,
      route: m.route,
      therapeuticClass: m.therapeuticClass,
      atcCode: m.atcCode,
      nhisCode: m.nhisCode,
      nhisTariffAmount: m.nhisTariffAmount,
      nhisPrescribingLevel: m.nhisPrescribingLevel,
      nhisUnitOfPricing: m.nhisUnitOfPricing,
      manufacturer: m.manufacturer,
      countryOfOrigin: m.countryOfOrigin,
      prescriptionStatus: m.prescriptionStatus,
      controlledStatus: m.controlledStatus,
      isHighAlert: !!m.isHighAlert,
      pregnancyCategory: m.pregnancyCategory,
      lactationSafety: m.lactationSafety,
      storageConditions: m.storageConditions,
      barcode: inventoryItemBarcode,
      productCode: m.productCode,
    },
    batch: batch
      ? {
          id: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate?.toISOString() || null,
          manufactureDate: batch.manufactureDate?.toISOString() || null,
          sellingPrice: batch.sellingPrice ?? null,
          costPrice: batch.costPrice ?? null,
          status: batch.status,
          daysToExpiry: expiryInfo.daysToExpiry,
          isExpired: expiryInfo.isExpired,
          isExpiringSoon: expiryInfo.isExpiringSoon,
        }
      : null,
    facility: {
      id: facility?.id || facilityId,
      name: facility?.name || "Facility",
      code: facility?.code || null,
      phone: facility?.phone || null,
      logoUrl: facilityLogoUrl,
    },
    organization: {
      id: organization.id,
      name: organization.name,
      logoUrl: organization.logoUrl,
    },
    patientAllergies,
    allergyConflict: !!conflictingAllergy,
    allergyConflictDetail: conflictingAllergy
      ? `Patient has active allergy to "${conflictingAllergy.allergen}" which may conflict with this medication.`
      : null,
    qrPayload,
    token,
    issuedAt: new Date().toISOString(),
    dispensedQuantity: item.dispensedQuantity,
  };

  return {
    content,
    organizationId: organization.id,
    facilityId,
    patientId: p.id,
    prescriptionId: item.prescription.id,
    inventoryBatchId: batch?.id || null,
  };
}

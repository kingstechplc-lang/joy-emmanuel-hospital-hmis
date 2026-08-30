# NHIA CLAIM-it XML Integration — Architecture & Mapping Document

This document describes the architecture, field-level mapping, configuration knobs, validation rules, and known gaps of the NHIA CLAIM-it XML integration module.

**Location**: `src/integrations/nhia/claim-it/`
**Schema version**: 2.0 (CLAIM-it User's Manual v2.0.0)
**Currency**: GHS
**Last updated**: 2026-08-30

---

## 1. Architecture Overview

The integration follows a strict **4-layer decoupled architecture**. Each layer has a single responsibility and a stable interface. Layers communicate only through the Intermediate Claims Object (ICO) — a plain TypeScript type that represents healthcare claims business data, completely independent of XML syntax or Prisma models.

```
┌──────────────────────────────────────────────────────────────────────┐
│  DATABASE  (Prisma)                                                  │
│  Encounter, Patient, Invoice, Prescription, Diagnosis, Referral...   │
└─────────────┬────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 1: ADAPTER                                                    │
│  src/integrations/nhia/claim-it/adapters/ClaimsDataAdapter.ts        │
│  ──────────────────────────────────────────────────────────────────  │
│  Responsibility: HMIS Prisma models → ICO                            │
│  Touches DB?      YES (only layer that does)                         │
│  Knows XML?      NO                                                  │
│  Knows NHIA?     YES (knows which fields NHIA needs)                 │
└─────────────┬────────────────────────────────────────────────────────┘
              │  IntermediateClaimsObject (ICO)
              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 2: VALIDATOR                                                  │
│  src/integrations/nhia/claim-it/validation/ClaimsValidator.ts       │
│  ──────────────────────────────────────────────────────────────────  │
│  Responsibility: Pure-function validation of an ICO                  │
│  Touches DB?      NO                                                 │
│  Knows XML?      NO                                                  │
│  Knows NHIA?     YES (knows NHIA required fields)                    │
└─────────────┬────────────────────────────────────────────────────────┘
              │  ValidationResult { valid, errors[], warnings[] }
              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 3: SERIALIZER                                                 │
│  src/integrations/nhia/claim-it/serialization/XMLSerializer.ts      │
│  ──────────────────────────────────────────────────────────────────  │
│  Responsibility: ICO → NHIA XML string                               │
│  Touches DB?      NO                                                 │
│  Knows Prisma?   NO                                                  │
│  Knows NHIA?     YES (uses tag config, knows NHIA date/amount format)│
└─────────────┬────────────────────────────────────────────────────────┘
              │  string (XML)
              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 4: TRANSPORT                                                  │
│  src/integrations/nhia/claim-it/transport/NHIAClaimItTransport.ts   │
│  ──────────────────────────────────────────────────────────────────  │
│  Responsibility: Deliver XML to destination                          │
│  Implementations:                                                    │
│    • FileExportTransport   — return XML as downloadable response     │
│    • ClaimItBridgeTransport — POST XML to localhost:31719 bridge     │
│  Touches DB?      NO                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

**Key design principles:**

- **Single source of truth for tag names** — `config/tags.ts` is the only file that knows XML tag strings. If NHIA changes a tag, update it in one place; no business logic changes.
- **Single source of truth for DB access** — `adapters/ClaimsDataAdapter.ts` is the only file that imports Prisma. The validator, serializer, and transport never touch the database.
- **Testable without a database** — The validator and serializer are pure functions. The test suite (505 assertions) runs in under a second with no DB.
- **Resilient to schema changes** — If the Prisma schema changes, only the adapter needs updating. The ICO acts as an anti-corruption layer.

---

## 2. Pipeline (End-to-End)

```ts
// src/integrations/nhia/claim-it/index.ts
generateAndExportClaim(encounterId, organizationId, options) → {
  ico,         // IntermediateClaimsObject
  validation,  // ValidationResult
  xml,         // string | null (null if validation failed)
  exportResult,// ExportResult (file path / submission ref)
  warnings,    // string[] (adapter-level notes)
}
```

**Steps:**

1. **Build ICO** — `buildICOFromEncounter(encounterId, orgId)` queries the DB and assembles the ICO.
2. **Validate** — `validateICO(ico)` runs ~30 validation rules (required fields, ICD-10, totals, etc.).
3. **Serialize** — If valid (or `skipValidation` is set), `serializeNHIAClaim(ico)` produces the XML string.
4. **Export** — `transport.exportClaim(ico, xml)` delivers the XML (file download or bridge POST).
5. **Persist** — The API route upserts a `NhiaClaimExport` row recording the generation (status, validation summary, XML payload, audit info).

---

## 3. Field-Level Mapping: NHIA XML ↔ ICO ↔ HMIS Prisma

The mapping below is the authoritative source of truth for what each NHIA XML field contains, where it comes from in the HMIS, and what transformations are applied.

### 3.1 Header

| NHIA XML Tag | ICO Path | HMIS Source | Transformation | Required |
|---|---|---|---|---|
| `ClaimBatchRef` | `header.claimBatchRef` | Computed | `BAT-{facility.code}-{yyyy-MM}` | Yes |
| `ClaimNumber` | `header.claimNumber` | Computed from encounter ID | `CLM-{facility.code}-{yyyyMMdd}-{last8ofEncounterId}` | Yes |
| `SubmissionPeriod` | `header.submissionPeriod` | `encounter.startAt` | `yyyy-MM` (ISO year-month) | Yes |
| `GeneratedAt` | `header.generatedAt` | `new Date()` | `yyyy-MM-dd'T'HH:mm:ss` | Yes |
| `SchemaVersion` | `header.schemaVersion` | Constant `"2.0"` | — | Yes |
| `TransactionType` | `header.transactionType` | Constant `"NEW"` | Future: detect resubmission via existing InsuranceClaim | Yes |
| `Currency` | `header.currency` | Constant `"GHS"` | — | Yes |
| `FacilityCode` | `header.facilityCode` | `facility.code` | — | Yes |
| `ProviderId` | `header.providerId` | (gap) | Omitted when null | No |

### 3.2 Facility

| NHIA XML Tag | ICO Path | HMIS Source | Transformation | Required |
|---|---|---|---|---|
| `FacilityId` | `facility.facilityId` | `facility.id` | — | Yes |
| `FacilityCode` | `facility.facilityCode` | `facility.code` | — | Yes |
| `FacilityName` | `facility.facilityName` | `facility.name` | — | Yes |
| `HPN` | `facility.hpn` | (gap) | Omitted when null | No |
| `Region` | `facility.region` | `facility.region` | — | No |
| `District` | `facility.district` | (gap) | Omitted when null | No |
| `FacilityType` | `facility.facilityType` | `facility.facilityType` | — | No |
| `Ownership` | `facility.ownership` | (gap) | Omitted when null | No |

### 3.3 Patient / Member

| NHIA XML Tag | ICO Path | HMIS Source | Transformation | Required |
|---|---|---|---|---|
| `PatientId` | `patient.internalPatientId` | `patient.id` | — | Yes |
| `PatientNumber` | `patient.patientNumber` | `patient.patientNumber` | — | No |
| `MemberNumber` | `patient.nhisNumber` | `patientInsurance.membershipNumber` OR `invoice.nhisNumber` OR `patientIdentifier.identifierValue` (type=`insurance_number`) | `normalizeMemberNumber()` — strip spaces/dashes, uppercase | Yes (NHIS claims) |
| `GhanaCardPIN` | `patient.ghanaCardPin` | `patientIdentifier.identifierValue` (type=`ghana_card`) | — | No |
| `CardSerialNumber` | `patient.cardSerialNumber` | `patientInsurance.policyNumber` | — | No |
| `Surname` | `patient.surname` | `patient.lastName` | — | Yes |
| `OtherNames` | `patient.otherNames` | `patient.firstName` + `patient.middleName` | Space-joined, falsy filtered | Yes |
| `DateOfBirth` | `patient.dateOfBirth` | `patient.dateOfBirth` | `yyyy-MM-dd` | No (warning) |
| `Sex` | `patient.sex` | `patient.sex` | `"male"→"M"`, `"female"→"F"`, else `"U"` | No (warning) |
| `Phone` | `patient.phone` | `patient.phone` | — | No |
| `InsuranceProvider` | `patient.insuranceProvider` | `insuranceProvider.name` | Default `"NHIS"` | No |
| `InsuranceMembershipStatus` | `patient.insuranceMembershipStatus` | `patientInsurance.status` | — | No |
| `NhisEligibilityStatus` | `patient.nhisEligibilityStatus` | `patientInsurance.verificationStatus` | — | No |

### 3.4 Encounter / Visit

| NHIA XML Tag | ICO Path | HMIS Source | Transformation | Required |
|---|---|---|---|---|
| `EncounterId` | `encounter.encounterId` | `encounter.id` | — | Yes |
| `EncounterNumber` | `encounter.encounterNumber` | `encounter.encounterNumber` | — | Yes |
| `VisitDate` | `encounter.visitDate` | `encounter.startAt` | `yyyy-MM-dd` | Yes |
| `ArrivalTime` | `encounter.arrivalTime` | `encounter.startAt` | `yyyy-MM-dd'T'HH:mm:ss` | No |
| `EncounterType` | `encounter.encounterType` | `encounter.encounterType` | Map: `opd→OPD`, `emergency→EMERGENCY`, `inpatient→IPD`, `laboratory→LAB`, `pharmacy→PHARMACY`, else `OTHER` | Yes |
| `OpdIpdStatus` | `encounter.opdIpdStatus` | `encounter.encounterType` | `"inpatient"→"IPD"`, else `"OPD"` | Yes |
| `Department` | `encounter.department` | `department.name` | — | No |
| `Specialty` | `encounter.specialty` | (gap) | Omitted when null | No |
| `AttendingProvider` | `encounter.attendingProvider` | (gap) | `encounter.attendingStaffId` is plain FK without a relation | No |
| `AdmissionDate` | `encounter.admissionDate` | `admission.admittedAt` | `yyyy-MM-dd` | No |
| `DischargeDate` | `encounter.dischargeDate` | `admission.dischargedAt` | `yyyy-MM-dd` | No |

### 3.5 Referral (nested inside Encounter)

| NHIA XML Tag | ICO Path | HMIS Source | Transformation | Required |
|---|---|---|---|---|
| `ReferringFacilityName` | `referral.referringFacilityName` | `referringFacility.name` | — | No |
| `ReferringFacilityCode` | `referral.referringFacilityCode` | `referringFacility.code` | — | No |
| `ReferringFacilityCCC` | `referral.referringFacilityCCC` | (gap) | Omitted when null | No |
| `ReferralDate` | `referral.referralDate` | `referral.referredAt` | `yyyy-MM-dd` | No |
| `ReferralReason` | `referral.referralReason` | `referral.reason` | — | No |

### 3.6 Attendance Verification

| NHIA XML Tag | ICO Path | HMIS Source | Transformation | Required |
|---|---|---|---|---|
| `Method` | `attendanceVerification.method` | Constant `"CCC"` | Future: integrate with biometric / OTAC devices | Yes |
| `Code` | `attendanceVerification.code` | (gap) | The CCC code itself — not stored in HMIS | No (warning) |
| `VerifiedAt` | `attendanceVerification.verifiedAt` | (gap) | Omitted when null | No |
| `VerificationStatus` | `attendanceVerification.verificationStatus` | Constant `"NOT_REQUIRED"` | Future: integrate with claims eligibility check | Yes |
| `Source` | `attendanceVerification.source` | Constant `"HMIS"` | — | No |

### 3.7 Diagnoses

| NHIA XML Tag | ICO Path | HMIS Source | Transformation | Required |
|---|---|---|---|---|
| `DiagnosisCode` | `diagnoses[].diagnosisCode` | `diagnosis.diagnosisCode` OR `diagnosis.catalog.code` | ICD-10 format validated | Yes |
| `DiagnosisDescription` | `diagnoses[].diagnosisDescription` | `diagnosis.diagnosisName` | — | Yes |
| `DiagnosisType` | `diagnoses[].diagnosisType` | `diagnosis.diagnosisType` | Uppercased: `primary→PRIMARY`, `secondary→SECONDARY` | Yes |
| `CodingSystem` | `diagnoses[].codingSystem` | `diagnosis.codeSystem` | Default `"ICD-10"` | Yes |
| `GDRGCode` | `diagnoses[].gdrgCode` | `diagnosis.catalog.nhisGdrgCode` | — | No |
| `GDRGName` | `diagnoses[].gdrgName` | `diagnosis.catalog.nhisGdrgName` | — | No |
| `IsPrimary` | `diagnoses[].isPrimary` | `diagnosis.isPrimary` | `true`/`false` string | Yes |

### 3.8 Services

| NHIA XML Tag | ICO Path | HMIS Source | Transformation | Required |
|---|---|---|---|---|
| `ItemId` | `services[].internalItemId` | `invoiceItem.id` | — | Yes |
| `NhisTariffCode` | `services[].nhisTariffCode` | `service.nhisServiceCode` | — | No (warning) |
| `ServiceCode` | `services[].serviceCode` | `service.code` | — | No |
| `ServiceDescription` | `services[].serviceDescription` | `invoiceItem.description` | — | Yes |
| `Quantity` | `services[].quantity` | `invoiceItem.quantity` | Integer | Yes |
| `UnitPrice` | `services[].unitPrice` | `invoiceItem.unitPrice` | 2 decimals | Yes |
| `ApprovedTariffPrice` | `services[].approvedTariffPrice` | `service.nhisPrice` | 2 decimals | No |
| `TotalAmount` | `services[].totalAmount` | `invoiceItem.total` | 2 decimals | Yes |
| `ServiceDate` | `services[].serviceDate` | `procedure.performedAt` OR `invoice.issuedAt` OR `encounter.startAt` | `yyyy-MM-dd` | Yes |
| `ServiceDepartment` | `services[].department` | `department.name` | — | No |
| `ServiceProvider` | `services[].provider` | `procedure.performedBy.firstName + lastName` | — | No |
| `ItemStatus` | `services[].itemStatus` | Constant `"ACTIVE"` | Future: detect reversed/cancelled items | Yes |
| `GDRGCode` | `services[].gdrgCode` | (gap) | Procedure has no catalog relation for GDRG | No |
| `GDRGName` | `services[].gdrgName` | (gap) | — | No |
| `ServiceCategory` | `services[].serviceCategory` | `service.category` | Uppercased; default `OTHER` | Yes |

### 3.9 Drugs / Medicines

| NHIA XML Tag | ICO Path | HMIS Source | Transformation | Required |
|---|---|---|---|---|
| `ItemId` | `drugs[].internalItemId` | `invoiceItem.id` | — | Yes |
| `NhisMedicineCode` | `drugs[].nhisMedicineCode` | `medication.nhisCode` | — | No (warning) |
| `GNDLCode` | `drugs[].gndlCode` | (gap) | Ghana National Drug List code — not in HMIS | No |
| `MedicineName` | `drugs[].medicineName` | `medication.genericName + brandName` | Space-joined, trimmed | Yes |
| `Strength` | `drugs[].strength` | `medication.strength + strengthUnit` | Space-joined | No |
| `Formulation` | `drugs[].formulation` | `medication.dosageForm` | — | No |
| `Quantity` | `drugs[].quantity` | `invoiceItem.quantity` | Integer | Yes |
| `Unit` | `drugs[].unit` | `medication.unit` | — | No |
| `UnitPrice` | `drugs[].unitPrice` | `invoiceItem.unitPrice` | 2 decimals | Yes |
| `ApprovedNhisPrice` | `drugs[].approvedNhisPrice` | `medication.nhisTariffAmount` | 2 decimals | No |
| `TotalAmount` | `drugs[].totalAmount` | `invoiceItem.total` | 2 decimals | Yes |
| `DispensingDate` | `drugs[].dispensingDate` | `invoice.issuedAt` OR `encounter.startAt` | `yyyy-MM-dd` | Yes |
| `Prescription` | `drugs[].prescription` | `prescriptionItem.dose + frequency + duration` | Format: `"{dose} x {frequency} x {duration}"` | No |
| `PrescriberId` | `drugs[].prescriberId` | `prescription.prescriberId` | — | No |
| `PharmacistId` | `drugs[].pharmacistId` | (gap) | Dispensing pharmacist not tracked on dispense records | No |
| `ItemStatus` | `drugs[].itemStatus` | Constant `"ACTIVE"` | Future: detect returned items | Yes |

### 3.10 Totals

| NHIA XML Tag | ICO Path | HMIS Source | Transformation | Required |
|---|---|---|---|---|
| `TotalServiceAmount` | `totals.totalServiceAmount` | Sum of `services[].totalAmount` | 2 decimals | Yes |
| `TotalDrugAmount` | `totals.totalDrugAmount` | Sum of `drugs[].totalAmount` | 2 decimals | Yes |
| `GrossAmount` | `totals.grossAmount` | `totalServiceAmount + totalDrugAmount` | 2 decimals | Yes |
| `TotalDeductions` | `totals.totalDeductions` | Constant `0` | Future: apply co-pay deductions | Yes |
| `PatientAmount` | `totals.patientAmount` | `invoice.patientResponsibility` | 2 decimals | Yes |
| `NhisAmount` | `totals.nhisAmount` | `invoice.nhisResponsibility` OR `grossAmount` if null | 2 decimals | Yes |
| `NetAmount` | `totals.netAmount` | `grossAmount - totalDeductions` | 2 decimals | Yes |

### 3.11 Metadata

| NHIA XML Tag | ICO Path | HMIS Source | Transformation | Required |
|---|---|---|---|---|
| `SourceSystem` | `metadata.sourceSystem` | Constant `"JEM-HMIS"` | — | Yes |
| `SourceVersion` | `metadata.sourceVersion` | Constant `"1.0"` | — | Yes |
| `TariffScheduleVersion` | `metadata.tariffScheduleVersion` | (gap) | Not tracked in HMIS | No |
| `MedicinePriceVersion` | `metadata.medicinePriceVersion` | (gap) | Not tracked in HMIS | No |
| `BaseDataVersion` | `metadata.baseDataVersion` | (gap) | Not tracked in HMIS | No |

---

## 4. Validation Rules

The validator runs ~30 rules. Each produces either an ERROR (blocks generation) or WARNING (informational).

### 4.1 Patient Rules

| Code | Severity | Rule |
|---|---|---|
| `PATIENT_SURNAME_MISSING` | ERROR | `patient.surname` must be non-empty |
| `PATIENT_OTHER_NAMES_MISSING` | ERROR | `patient.otherNames` must be non-empty |
| `NHIS_MEMBER_ID_MISSING` | ERROR | `patient.nhisNumber` (normalized) must be non-empty |
| `NHIS_MEMBER_ID_SHORT` | WARNING | Normalized NHIS number < 8 chars (likely malformed) |
| `PATIENT_DOB_MISSING` | WARNING | `patient.dateOfBirth` is null |
| `PATIENT_SEX_MISSING` | WARNING | `patient.sex` is null |

### 4.2 Facility Rules

| Code | Severity | Rule |
|---|---|---|
| `FACILITY_CODE_MISSING` | ERROR | `facility.facilityCode` must be non-empty |
| `FACILITY_NAME_MISSING` | ERROR | `facility.facilityName` must be non-empty |

### 4.3 Encounter Rules

| Code | Severity | Rule |
|---|---|---|
| `ENCOUNTER_DATE_MISSING` | ERROR | `encounter.visitDate` must be a valid date |
| `ENCOUNTER_TYPE_MISSING` | ERROR | `encounter.encounterType` must be set |

### 4.4 Attendance Verification Rules

| Code | Severity | Rule |
|---|---|---|
| `ATTENDANCE_PENDING` | WARNING | `verificationStatus === "PENDING"` |
| `ATTENDANCE_FAILED` | ERROR | `verificationStatus === "FAILED"` |
| `CCC_CODE_MISSING` | WARNING | Method is `"CCC"` but no code provided |

### 4.5 Diagnosis Rules

| Code | Severity | Rule |
|---|---|---|
| `NO_DIAGNOSES` | ERROR | At least one diagnosis is required |
| `NO_PRIMARY_DIAGNOSIS` | ERROR | At least one diagnosis must have `isPrimary=true` |
| `MULTIPLE_PRIMARY_DIAGNOSES` | WARNING | More than one primary diagnosis found |
| `INVALID_ICD10` | ERROR | Diagnosis code does not match `^[A-Z]\d{2}(\.[A-Z0-9]{1,4})?$` |

### 4.6 Service Rules

| Code | Severity | Rule |
|---|---|---|
| `INVALID_SERVICE_QUANTITY` | ERROR | `quantity` must be > 0 |
| `INVALID_SERVICE_PRICE` | ERROR | `unitPrice` cannot be negative |
| `SERVICE_TARIFF_CODE_MISSING` | WARNING | `nhisTariffCode` is null |
| `SERVICE_AMOUNT_MISMATCH` | WARNING | `totalAmount !== unitPrice * quantity` |

### 4.7 Drug Rules

| Code | Severity | Rule |
|---|---|---|
| `INVALID_DRUG_QUANTITY` | ERROR | `quantity` must be > 0 |
| `INVALID_DRUG_PRICE` | ERROR | `unitPrice` cannot be negative |
| `DRUG_CODE_MISSING` | WARNING | `nhisMedicineCode` is null |
| `DRUG_AMOUNT_MISMATCH` | WARNING | `totalAmount !== unitPrice * quantity` |

### 4.8 Totals Rules

| Code | Severity | Rule |
|---|---|---|
| `SERVICE_TOTAL_MISMATCH` | ERROR | `totals.totalServiceAmount` ≠ Σ(service.totalAmount) — tolerance 0.01 |
| `DRUG_TOTAL_MISMATCH` | ERROR | `totals.totalDrugAmount` ≠ Σ(drug.totalAmount) — tolerance 0.01 |
| `GROSS_TOTAL_MISMATCH` | ERROR | `totals.grossAmount` ≠ service + drug totals — tolerance 0.01 |
| `NET_TOTAL_MISMATCH` | ERROR | `totals.netAmount` ≠ gross - deductions — tolerance 0.01 |
| `NO_CLAIM_ITEMS` | ERROR | Both `services[]` and `drugs[]` are empty |

---

## 5. Configuration

### 5.1 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NHIA_CLAIMIT_TRANSPORT` | `"file"` | Transport mode: `file` or `bridge` |
| `NHIA_CLAIMIT_BRIDGE_URL` | `"http://localhost:31719"` | URL of the CLAIM-it HMS bridge service |
| `NHIA_CLAIMIT_TIMEOUT_MS` | `15000` | HTTP timeout for bridge requests |
| `NHIA_CLAIMIT_RETRY_COUNT` | `3` | Number of retries on bridge failure (5xx or network) |

### 5.2 Tag Configuration

All XML tag names are centralized in `config/tags.ts`. Tags marked **"REQUIRES NHIA CONFIRMATION"** are based on standard NHIS conventions and have not been verified against the official CLAIM-it XSD. If you have access to the official schema, verify and update these tags.

### 5.3 Permissions

| Permission | Description | Granted to |
|---|---|---|
| `nhia_claim.view` | View dashboard, history, eligible encounters | accountant, cashier, records_officer, facility_admin, organization_admin |
| `nhia_claim.generate` | Validate, generate XML, download | accountant, records_officer, facility_admin, organization_admin |
| `nhia_claim.config` | Configure transport, tags, mappings | organization_admin |

### 5.4 Transport Modes

**File mode (default)**

The API returns the XML as an HTTP response with `Content-Type: application/xml` and `Content-Disposition: attachment`. The user downloads the file to a flash drive and imports it into CLAIM-it desktop app manually.

**Bridge mode**

The transport POSTs the XML to `${NHIA_CLAIMIT_BRIDGE_URL}/api/claims/import`. The bridge service (typically running on `localhost:31719` on the facility's local network) forwards the XML to the CLAIM-it desktop app's import endpoint. Health check at `${NHIA_CLAIMIT_BRIDGE_URL}/api/health`.

The bridge uses:
- Exponential backoff retry (2s, 4s, 8s)
- AbortController timeout (15s default)
- No retry on 4xx client errors
- Submission reference returned in the response body

---

## 6. Database Persistence

Every generation is recorded in the `NhiaClaimExport` table (Prisma model in `schema.prisma`).

| Field | Type | Description |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `organizationId` | String | Tenant isolation |
| `facilityId` | String? | Facility scope |
| `encounterId` | String | Source encounter |
| `patientId` | String? | Patient snapshot |
| `patientName` | String? | Display name (denormalized) |
| `invoiceId` | String? | Source invoice |
| `insuranceClaimId` | String? | Linked InsuranceClaim |
| `claimNumber` | String (unique) | `CLM-{facility}-{date}-{hash}` |
| `batchRef` | String? | `BAT-{facility}-{yyyy-MM}` |
| `submissionPeriod` | String? | `yyyy-MM` |
| `status` | String | `draft` / `validated` / `xml_generated` / `exported` / `failed` |
| `isValid` | Boolean | True if validator returned no errors |
| `errorCount` | Int | Number of validation errors |
| `warningCount` | Int | Number of validation warnings |
| `validationErrors` | String? | JSON array of `ValidationError` |
| `adapterWarnings` | String? | JSON array of strings from adapter |
| `totalServiceAmount` / `totalDrugAmount` / `grossAmount` / `nhisAmount` / `patientAmount` / `netAmount` | Float | Financial snapshot |
| `itemCount` / `diagnosisCount` | Int | Item counts |
| `xmlPayload` | String (TEXT) | The actual XML payload |
| `xmlSizeBytes` | Int? | Payload size |
| `transportMode` | String? | `file` or `bridge` |
| `filePath` | String? | Virtual file path (for file mode) |
| `submissionRef` | String? | External ref from bridge |
| `transportError` | String? | Bridge error message |
| `generatedById` / `generatedByName` | String? | Audit |
| `generatedAt` | DateTime | When generation ran |
| `downloadedAt` | DateTime? | Last download |
| `downloadCount` | Int | Total downloads |

**Upsert behavior**: If a record with the same `claimNumber` already exists (e.g., the user re-generates XML for the same encounter), the record is updated in place. This keeps the history clean and prevents duplicate `claimNumber` constraint violations.

---

## 7. API Endpoints

| Method | Path | Description | Permission |
|---|---|---|---|
| `GET` | `/api/nhia-claims` | List generation history (filter by facility, status, period, encounter) | `nhia_claim.view` |
| `POST` | `/api/nhia-claims` | Generate XML from an encounter (full pipeline + persist) | `nhia_claim.generate` |
| `GET` | `/api/nhia-claims/[id]` | Fetch a single generation record | `nhia_claim.view` |
| `POST` | `/api/nhia-claims/validate` | Dry-run validation (no persist, no XML) | `nhia_claim.view` |
| `GET` | `/api/nhia-claims/download?id=...` | Download XML file (bumps download count) | `nhia_claim.view` |
| `GET` | `/api/nhia-claims/health` | Check bridge reachability | `nhia_claim.view` |
| `GET` | `/api/nhia-claims/stats` | Dashboard KPIs + status breakdown + recent activity | `nhia_claim.view` |
| `GET` | `/api/nhia-claims/encounters` | List encounters eligible for NHIA claim generation | `nhia_claim.view` |

All endpoints enforce organization-level tenancy and require NextAuth authentication.

---

## 8. Known Gaps & Future Work

The following NHIA fields have **no current source** in the HMIS database. They are emitted as null/omitted in the XML, which may cause CLAIM-it to reject or query the claim. They are flagged as gaps in the validator (warning level) so the user is aware.

| NHIA Field | Gap | Suggested Resolution |
|---|---|---|
| `AttendanceVerification.Code` (CCC code) | Not captured in HMIS — the CCC (Claim Center Code) is generated by the NHIA member verification system at point of care | Integrate with NHIA member verification API (separate initiative) |
| `Facility.HPN` | Health Provider Number not stored on Facility | Add `nhiaHpn` field to Facility model |
| `Facility.District` | Not stored separately (only `region` is) | Add `district` field to Facility model |
| `Facility.Ownership` | Not stored | Add `ownership` field (e.g., `public`, `private`, `mission`, `ngo`) |
| `Encounter.Specialty` | Not captured as a discrete field | Add `specialtyCode` field to Encounter |
| `Encounter.AttendingProvider` | `encounter.attendingStaffId` is a plain FK without a Prisma relation defined | Add the relation: `attendingStaff Staff? @relation("encounterAttendingStaff", ...)`. Then resolve to `staff.firstName + lastName` in the adapter |
| `Referral.ReferringFacilityCCC` | Not captured | Add `referringFacilityCCC` snapshot field to Referral |
| `Services[].GDRGCode` / `GDRGName` | Procedure has no catalog relation for G-DRG | Link Procedure to DiagnosisCatalog (or a dedicated GDRG catalog) |
| `Drugs[].GNDLCode` | Ghana National Drug List code not stored on Medication | Add `gndlCode` field to Medication model |
| `Drugs[].PharmacistId` | Dispensing pharmacist not tracked on dispense records | Add `dispensedById` to PrescriptionItem or Dispense record |
| `Metadata.TariffScheduleVersion` | Not tracked | Add a SystemSetting key for tariff schedule version |
| `Metadata.MedicinePriceVersion` | Not tracked | Add a SystemSetting key for medicine price list version |
| `Metadata.BaseDataVersion` | Not tracked | Add a SystemSetting key for base data version |
| `TransactionType` | Always `"NEW"` — no resubmission detection | If an `InsuranceClaim` already exists for the encounter with `status="rejected"`, emit `"RESUBMISSION"` instead |

---

## 9. Testing

### 9.1 Test Suite Location

| File | Purpose |
|---|---|
| `__tests__/fixtures/sample-ico.json` | Known-good Intermediate Claims Object |
| `__tests__/fixtures/sample-expected.xml` | Golden XML output (generated by serializer from sample-ico.json) |
| `scripts/nhia-tests/generate-golden-xml.ts` | Regenerates the golden XML fixture |
| `scripts/nhia-tests/run-tests.ts` | Main test suite (505 assertions) |

### 9.2 Running Tests

```bash
# Regenerate golden XML (run after modifying serializer or fixture)
npx tsx scripts/nhia-tests/generate-golden-xml.ts

# Run the test suite
npx tsx scripts/nhia-tests/run-tests.ts
```

### 9.3 Test Coverage

| Suite | Assertions | Coverage |
|---|---|---|
| XML Utilities (`escapeXml`) | 9 | All escape rules, null/undefined handling, control char removal |
| XML Utilities (`formatDateNHIA`) | 6 | ISO date format, padding, null/invalid handling |
| XML Utilities (`formatDateTimeNHIA`) | 2 | Datetime format, null handling |
| XML Utilities (`formatAmountNHIA`) | 6 | 2-decimal format, rounding, negatives |
| XML Utilities (`xmlElement`/`xmlOpen`/`xmlClose`) | 7 | Element construction, indent, self-closing, escaping |
| XML Utilities (`generateClaimRef`) | 5 | Format, prefix, facility code, date, hash suffix |
| XML Utilities (`generateBatchRef`) | 1 | Format |
| XML Utilities (`normalizeMemberNumber`) | 6 | Space/dash removal, uppercase, null/empty handling |
| XML Utilities (`isValidICD10`) | 11 | Valid codes, invalid codes, null/empty handling |
| Tag Configuration | 2 critical + ~100 tag-level | All tags are valid XML names, no spaces, non-empty |
| Validator — Valid ICO | 2 | Sample ICO passes, zero errors |
| Validator — Error Cases | 9 | Each error code triggered correctly |
| Validator — Warning Cases | 3 | Warnings triggered, claim stays valid |
| Serializer — Golden File | 1 | Byte-identical match against fixture |
| Serializer — Well-formed XML | 4 | XML declaration, root, tag balance |
| Serializer — Special Chars | 2 | Ampersand, angle brackets, quotes escaped |
| Serializer — Null Omission | 4 | Optional null fields are omitted |
| Serializer — Required Fields | 1 (with ~40 tag checks) | All required tags are present |
| Serializer — Amount Format | 4 | 2-decimal formatting |
| Round-trip Stability | 1 | Serialize twice → identical output |
| **TOTAL** | **505** | |

### 9.4 Adding New Tests

1. Edit `__tests__/fixtures/sample-ico.json` to add a test scenario.
2. Run `npx tsx scripts/nhia-tests/generate-golden-xml.ts` to refresh the golden XML.
3. Add a new `describe()` block in `scripts/nhia-tests/run-tests.ts`.
4. Run the suite to confirm green.

---

## 10. File Inventory

```
src/integrations/nhia/claim-it/
├── index.ts                              # Pipeline orchestrator (generateAndExportClaim)
├── types/claims.ts                       # ICO + Validation + Transport types
├── config/tags.ts                        # NHIA_XML_TAGS + NHIA_XML_CONFIG
├── utils/xml.ts                          # escapeXml, formatDateNHIA, etc.
├── adapters/ClaimsDataAdapter.ts         # Prisma → ICO (Layer 1)
├── validation/ClaimsValidator.ts         # Pure validation (Layer 2)
├── serialization/XMLSerializer.ts        # ICO → XML (Layer 3)
├── transport/NHIAClaimItTransport.ts     # File + Bridge transports (Layer 4)
├── __tests__/
│   └── fixtures/
│       ├── sample-ico.json               # Known-good ICO
│       └── sample-expected.xml           # Golden XML output
└── MAPPING.md                            # This document

src/app/api/nhia-claims/
├── route.ts                              # GET list, POST generate
├── [id]/route.ts                         # GET single record
├── validate/route.ts                     # POST dry-run validation
├── download/route.ts                     # GET XML download
├── health/route.ts                       # GET bridge health
├── stats/route.ts                        # GET dashboard KPIs
└── encounters/route.ts                   # GET eligible encounters

src/components/views/finance/
└── nhia-claims-view.tsx                  # UI dashboard + 3 tabs + 3 modals

scripts/nhia-tests/
├── generate-golden-xml.ts                # Refresh golden fixture
└── run-tests.ts                          # 505-assertion test suite

src/lib/permissions.ts                    # NHIA_CLAIM_VIEW, _GENERATE, _CONFIG
src/stores/app-store.ts                   # "nhia_claims" ViewKey + nav item
src/components/views/view-renderer.tsx    # nhia_claims → NhiaClaimsView mapping
prisma/schema.prisma                      # NhiaClaimExport model
```

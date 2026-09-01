# Manual Facility Acceptance Test Checklist

**Purpose:** A practical checklist a real Records Officer can execute against a staging
deployment to validate the NHIS/NHIA workflow end-to-end.

**Pre-requisites:**
- A facility is selected in the top bar
- An NHIS provider exists in Administration → Insurance Providers (providerType=nhis, status=active)
- The user has permissions: patient.create, encounter.create, encounter_coverage.manage,
  attendance_verification.capture, claim_readiness.evaluate, nhia_claim.generate
- A test patient with NHIS insurance exists (or create one below)

---

## Phase 1: Patient Registration & Check-in

- [ ] Go to Clinical → Register Patients
- [ ] Fill in patient demographics (name, DOB, sex, phone)
- [ ] Select NHIS as Insurance Provider
- [ ] Enter Membership Number (e.g., 34578923)
- [ ] Enter Coverage Start and End dates (end date in the future)
- [ ] Submit registration
- [ ] **Verify:** Patient created, no duplicate warning
- [ ] **Verify:** Patient 360 shows the NHIS insurance record in Demographics tab

- [ ] Go to Clinical → Records Desk
- [ ] Go to Check-in tab
- [ ] Search for the patient just registered
- [ ] Select encounter type (OPD)
- [ ] Click Check In
- [ ] **Verify:** Success toast appears
- [ ] **Verify:** If NHIS payer, toast offers "Open NHIS Workflow →" action
- [ ] **Verify:** If multiple insurance records, warning toast appears
- [ ] **Verify:** User is navigated to Patient 360

## Phase 2: NHIS Workflow

- [ ] Click "Open NHIS Workflow →" from the check-in toast (or navigate via sidebar)
- [ ] **Verify:** Patient is pre-selected (chip shows patient name)
- [ ] **Verify:** Encounter is pre-selected (highlighted in blue)
- [ ] If not pre-selected: search patient → select encounter manually

### Coverage
- [ ] Scroll to "Encounter Coverage" panel (step 3)
- [ ] **Verify:** Coverage shows payer=NHIS (auto-created at check-in)
- [ ] **Verify:** Coverage status badge = ACTIVE
- [ ] Click "Change" to modify coverage
- [ ] **Verify:** Insurance record card shows: provider, member #, coverage period, ACTIVE status
- [ ] Select the insurance record
- [ ] Click "Select Payer"
- [ ] **Verify:** Coverage updated successfully

### Eligibility
- [ ] Scroll to "Eligibility Verification" panel (step 4)
- [ ] Click "Verify Now"
- [ ] **Verify:** Dialog shows "Direct NHIA API: Not configured" notice
- [ ] **Verify:** Method dropdown includes: NHIA Facility/Operational, OTAC, External, Manual
- [ ] Select "NHIA Facility/Operational Verification"
- [ ] Select source "NHIA Operational Channel"
- [ ] Set result to "Verified"
- [ ] Click "Record Verification"
- [ ] **Verify:** Eligibility panel shows "NHIA Operational Verification" evidence label (blue)
- [ ] **Verify:** Evidence label does NOT say "unofficial" or "not official NHIA"

### Attendance
- [ ] Scroll to "Attendance Verification" panel (step 5)
- [ ] Click "Capture Code"
- [ ] Select method "OTAC"
- [ ] Enter a test code (e.g., 123456)
- [ ] Set status to "Verified"
- [ ] Click "Capture Code"
- [ ] **Verify:** Attendance shows method=OTAC, source=NHIA *929# OTAC
- [ ] **Verify:** Code displays as •••••••• (masked, with lock icon)

### Claim Readiness
- [ ] Scroll to "Claim Readiness" panel (step 7)
- [ ] Click "Evaluate Readiness"
- [ ] **Verify:** Checklist shows:
  - ✓ Patient identified
  - ✓ Payer selected
  - ✓ Insurance info present
  - ✓ Eligibility verified (NHIA Operational)
  - ✓ Attendance verified (OTAC)
  - ✗ Diagnosis missing (if no diagnosis yet)
  - ✗ Invoice missing (if no invoice yet)
- [ ] **Verify:** Status = NOT READY (red)
- [ ] **Verify:** Failure summary lists each missing item with ✗ marker

## Phase 3: Clinical Care

- [ ] Navigate to Clinical → Consultations
- [ ] Create a consultation for the encounter
- [ ] Navigate to Clinical → Triage & Vitals (optional)
- [ ] Record vitals
- [ ] Add a diagnosis (ICD-10 code, e.g., I10 - Essential hypertension)
- [ ] **Verify:** Diagnosis appears in the encounter

## Phase 4: Billing

- [ ] Navigate to Finance → Invoices
- [ ] Create a new invoice for the encounter
- [ ] Set payer type = NHIS
- [ ] Add line items (services with NHIS tariff codes)
- [ ] Issue the invoice
- [ ] **Verify:** Invoice total > 0
- [ ] **Verify:** NHIS responsibility > 0

## Phase 5: Claim Readiness (re-evaluate)

- [ ] Navigate back to Clinical → NHIS Workflow
- [ ] Select the same patient + encounter
- [ ] Click "Evaluate Readiness" again
- [ ] **Verify:** Now shows:
  - ✓ Patient identified
  - ✓ Payer selected
  - ✓ Insurance info present
  - ✓ Eligibility verified
  - ✓ Attendance verified
  - ✓ Diagnosis present
  - ✓ Billing valid
- [ ] **Verify:** Status = READY FOR EXPORT (green) or READY FOR VALIDATION (amber)
- [ ] **Verify:** "Generate Claim XML" button appears

## Phase 6: Insurance Claims

- [ ] Navigate to Finance → Insurance Claims
- [ ] Create a new claim for the encounter
- [ ] **Verify:** Claim created with correct patient, provider, invoice
- [ ] Open the claim detail dialog
- [ ] Click "Validate"
- [ ] **Verify:** Validation dialog shows:
  - Completeness %
  - Valid/Invalid banner
  - **Encounter Readiness panel** (upstream readiness score, status, failures)
  - Issues list (if any)
- [ ] **Verify:** "Open in NHIA CLAIM-it" button appears in footer
- [ ] **Verify:** "Open NHIS Workflow" button appears in footer

## Phase 7: NHIA CLAIM-it

- [ ] Click "Open in NHIA CLAIM-it" from Insurance Claims detail
- [ ] **Verify:** NHIA CLAIM-it view opens
- [ ] Go to "Eligible Encounters" tab
- [ ] **Verify:** The encounter appears in the eligible list
- [ ] Click "Generate XML"
- [ ] **Verify:** XML preview dialog appears
- [ ] **Verify:** XML contains: patient name, NHIS member number, diagnosis code, service code, amounts
- [ ] **Verify:** Status = "XML Generated" or "Exported" (NOT "NHIA Submitted")
- [ ] Click "Download XML"
- [ ] **Verify:** File downloads as .xml
- [ ] Open the detail dialog for the generation record
- [ ] **Verify:** "View Insurance Claim" button appears in footer
- [ ] **Verify:** "Open NHIS Workflow" button appears in footer

## Phase 8: Status Truthfulness

- [ ] **Verify:** No screen displays "NHIA Submitted" unless a real NHIA submission response exists
- [ ] **Verify:** No screen displays "NHIA Accepted" unless a real NHIA acceptance exists
- [ ] **Verify:** No screen displays "NHIA Verified" for manual/external verification
- [ ] **Verify:** Eligibility evidence labels are truthful:
  - NHIA Direct Verified → only if API was called
  - NHIA Operational Verification → for facility operational process
  - NHIA Attendance Verified → for OTAC/*929#
  - External Verification Recorded → for external system
  - Manual Record Check → for manual card check
- [ ] **Verify:** OTAC panel does NOT say "eligibility verified"
- [ ] **Verify:** Readiness engine treats OTAC as attendance, NOT eligibility

## Phase 9: Failure Scenarios

- [ ] **No insurance:** Register a patient with no insurance → check in → open NHIS Workflow
  - Verify: Coverage = self_pay, Eligibility/Attendance panels show SKIP
- [ ] **Expired insurance:** Register a patient with expired coverage → open Coverage dialog
  - Verify: Expired record shows EXPIRED badge, selection blocked without override permission
- [ ] **Multiple insurance:** Register a patient with 2+ active insurance → check in
  - Verify: Warning toast about multiple insurance records
- [ ] **Already checked in:** Try checking in the same patient again
  - Verify: "Already checked in" message, existing encounter returned, coverage warning if missing

## Phase 10: Cross-Module Navigation

- [ ] Patient 360 → Encounters tab → click "NHIS" action button → NHIS Workflow opens with encounter pre-selected
- [ ] Patient 360 → Encounters tab → click "Claims" action button → Insurance Claims opens
- [ ] Patient 360 → Encounters tab → click "CLAIM-it" action button → NHIA CLAIM-it opens
- [ ] Insurance Claims detail → "Open in NHIA CLAIM-it" → NHIA CLAIM-it opens
- [ ] Insurance Claims detail → "Open NHIS Workflow" → NHIS Workflow opens
- [ ] NHIA CLAIM-it detail → "View Insurance Claim" → Insurance Claims opens
- [ ] NHIA CLAIM-it detail → "Open NHIS Workflow" → NHIS Workflow opens

---

**Sign-off:**
- Tester: ___________________
- Date: ___________________
- Result: PASS / FAIL
- Notes: ___________________

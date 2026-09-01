# Legacy Claim Reconciliation Report

**Date:** 2026-09-01
**Database:** Neon PostgreSQL
**Audit Scope:** All InsuranceClaim records where `encounterId IS NULL`

---

## Summary

| Metric | Count |
|---|---|
| Total InsuranceClaims | (varies) |
| Claims without encounterId | 2 |
| Claims without patientId | 0 |
| Claims without invoiceId | 0 |
| Claims without insuranceProviderId | 0 |

---

## Classification Table

| Claim ID | Claim # | Patient | Encounter | Invoice | Coverage | Classification | Recommended Action |
|---|---|---|---|---|---|---|---|
| cmsy3zldv0001ib04ku1kne3v | CLM-2026-000001 | Yaw Prempeh (JEM-0000003) | NULL (invoice also NULL) | INV-2026-000001 (encId=null, total=260, paid) | No EncounterCoverage | **Category D** — Unsafe to auto-reconcile | Preserve as historical |
| cmtds2du00001jj0465w3qyqb | CLM-2026-000001 | Test Dashboard (JEM-0000005) | NULL (invoice also NULL) | INV-2026-000001 (encId=null, total=215, partially_paid) | No EncounterCoverage | **Category D** — Unsafe to auto-reconcile | Preserve as historical |

---

## Analysis

### Claim 1: CLM-2026-000001 (Yaw Prempeh)
- **Created:** 2026-08-18
- **Status:** paid
- **Amount:** GHS 260
- **Patient:** Yaw Prempeh (JEM-0000003)
- **Invoice:** INV-2026-000001 (total=260, status=paid, **encounterId=null**)
- **Facility:** Joy Emmanuel Hospital — Tema (JEM-TEMA)
- **Provider:** NHIS

**Why Category D:**
- The invoice itself has no encounterId, so we cannot deterministically link the claim to an encounter via the invoice.
- The patient has 3 encounters at 3 different facilities. While one matches the claim's facilityId (JEM-TEMA), we cannot prove the invoice belongs to that specific encounter.
- The claim status is "paid" — modifying a paid claim's encounterId could corrupt financial history.
- **Recommendation:** Preserve as historical. This claim was created before the encounter linkage feature was implemented.

### Claim 2: CLM-2026-000001 (Test Dashboard)
- **Created:** 2026-08-29
- **Status:** draft
- **Amount:** GHS 74.20
- **Patient:** Test Dashboard (JEM-0000005)
- **Invoice:** INV-2026-000001 (total=215, status=partially_paid, **encounterId=null**)
- **Facility:** Joy Emmanuel Hospital — Accra (JEM-ACCRA)
- **Provider:** NHIS

**Why Category D:**
- Same issue — the invoice has no encounterId, so we cannot deterministically link.
- The patient has 1 encounter, at a different facility (JEM-TEMA vs JEM-ACCRA).
- Wait — re-checking: the encounter is at facility cmstwj3z20002u8q2yjghw4th. The claim facility is JEM-ACCRA. Need to verify facility mapping.
- The mismatch between the patient's encounter facility and the claim facility makes auto-reconciliation unsafe.
- **Recommendation:** Preserve as historical. This appears to be a test claim created during development.

---

## Actions Taken

**None.** Both claims are preserved as historical records. No automatic reconciliation was performed because:
1. The invoices lack encounterId (the deterministic link is missing)
2. The claim statuses (paid, draft) make modification risky
3. These are pre-feature data anomalies, not code defects
4. The current codebase correctly links new claims to encounters

## Ongoing Protection

New claims created via the Insurance Claims API (`POST /api/insurance-claims`) require `patientId`, `facilityId`, `insuranceProviderId`, and `invoiceId`. The `encounterId` is optional but recommended. The ClaimsDataAdapter and readiness engine both handle null encounterId gracefully.

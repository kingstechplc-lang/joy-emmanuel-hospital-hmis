# Phase 0 — Focused Architecture Verification (Tier 2)

**Goal:** Before implementing Tier 2 (Dashboard Widgets, Clinical Templates, Batch Operations), verify what already exists, what can be reused, what is incomplete, and what requires new architecture. **Do not rebuild functioning features.**

---

## 1. DASHBOARDS

### What exists ✅
- **Single role-aware dashboard view** (`src/components/views/dashboard-view.tsx`, 425 lines)
  - `ALL_KPIs[]` array of 17 KPI definitions, each `{key, label, icon, color, perm, view, getValue}`
  - `ALL_QUICK_ACTIONS[]` array of 17 quick-action buttons, each `{label, view, icon, perm}`
  - Filters KPIs and quick actions by user permissions at render time
  - Already shows different KPIs to different roles via `has(perm)` check
- **Single backend endpoint** (`src/app/api/dashboard/stats/route.ts`, 155 lines)
  - Returns 22 aggregated KPIs in a single response (parallel `Promise.all`)
  - Already enforces `organizationId` + `facilityId` server-side
  - Polling refresh: `refetchInterval: 30000` (30s) in the view's `useQuery`
- **Department Dashboard** (`src/components/views/admin/department-dashboard-view.tsx`)
  - Per-department operational view (separate from main dashboard)
- **Specialized dashboards** exist for: training, workforce, payroll, certification, attendance — these are module-scoped, not user-configurable

### What's missing for Tier 2 ❌
- No widget registry — KPI definitions are hard-coded in the dashboard component
- No per-user dashboard layout persistence (the app-store only persists `activeFacilityId` and `sidebarCollapsed`)
- No drag-and-drop UI (but `@dnd-kit/core` is installed but unused)
- No widget configuration (date range, scope, max items) — current KPIs use fixed scopes
- No drill-down KPIs (clicking a KPI doesn't navigate to a filtered view)
- No widget add/remove/resize UI
- No "no data" vs "failed to load" differentiation (currently a single error card covers both)

### What can be reused ✅
- `ALL_KPIs` array (the data definitions are correct, just need to be extracted to a registry)
- `/api/dashboard/stats` endpoint (extend it; don't replace it)
- `useQuery` polling pattern (already 30s)
- Role-permission gating pattern: `const has = (p) => isSuperAdmin || perms.includes(p)`
- The 22 KPIs already cover the main scenarios from the prompt (patients, encounters, lab, pharmacy, billing, inventory, beds, referrals, tasks, audit)

### What should be extended
- Extract `ALL_KPIs` → `src/lib/dashboard/widget-registry.ts`
- Add `DashboardLayout` + `DashboardWidgetInstance` models to Prisma
- Add `/api/dashboard/layout` GET/PUT for per-user layout persistence
- Add widget config schema (date range, facility scope, max items)
- Add drill-down navigation (KPI → filtered view)

---

## 2. CLINICAL TEMPLATES / ORDER SETS

### What exists ✅
- **Diagnosis Engine + ICD-10 catalog** (`src/app/api/diagnoses/*`, `src/components/views/admin/diagnosis-engine-view.tsx` 445 lines)
  - `DiagnosisCatalog` model with codes, categories, favorites
  - `DiagnosisFavorite` for personal favorites
  - Already supports search, filters, versioning of catalog entries
- **Lab Test Catalog** with versioning (`LaboratoryTest`, `LabTestVersion`, `LabTestCatalogAudit`)
- **Procedure Catalog** (`ProcedureCatalog`, `ProcedureCatalogFacilityAvailability`)
- **Service Package** (`ServicePackage` + `ServicePackageItem`) — bundles services for billing
- **Medication catalog** with interactions (`Medication`, `MedicationInteraction` — already seeded with 27 DDI rules)
- **Consultation model** has all the structured fields: HPI, PMH, PSH, MH, FH, SH, ROS, PE, Assessment, Plan, Follow-up
- **Existing ordering flows**:
  - `/api/lab-orders` POST creates lab orders with items
  - `/api/prescriptions` POST creates prescriptions with items (transactional with CDSS checks)
  - `/api/imaging` POST creates imaging orders
  - `/api/procedures` POST creates procedure records
  - `/api/consultations` POST creates consultation records
  - All enforce RBAC + audit + org/facility scoping

### What's missing for Tier 2 ❌
- No `ClinicalTemplate` or `OrderSet` model — this is genuinely new
- No template application workflow (select → preview → modify → confirm → orders created)
- No template lifecycle (DRAFT → UNDER_REVIEW → APPROVED → ACTIVE → INACTIVE → ARCHIVED)
- No template versioning (no `ClinicalTemplateVersion` model)
- No template scoping (SYSTEM / ORGANIZATION / FACILITY / DEPARTMENT / PERSONAL)
- No template admin UI
- No template application UI inside consultations

### What can be reused ✅
- All existing order-creation endpoints (lab, imaging, prescription, procedure) — templates route through these, NOT duplicate them
- Consultation data model (templates can pre-populate `chiefComplaint`, `historyPresentingIllness`, etc.)
- `ServicePackage` pattern (existing bundling concept is similar)
- Audit log infrastructure (`auditLog()` helper, `AuditLog` model)
- RBAC architecture (`hasPermission` check pattern)
- Org/facility scoping pattern (`organizationId` + `facilityId` on every model)
- `DiagnosisFavorite` pattern (for template favorites/recent)

### What requires new architecture
- `ClinicalTemplate` model (new)
- `ClinicalTemplateVersion` model (new — preserves history)
- `ClinicalTemplateItem` model (new — lab/imaging/rx/procedure/service items inside template)
- `ClinicalTemplateFavorite` model (new — personal favorites, mirroring `DiagnosisFavorite`)
- `ClinicalTemplateApplication` model (new — audit record of when a template was applied to an encounter)
- New API routes: `/api/clinical-templates` (CRUD), `/api/clinical-templates/[id]/apply` (apply to encounter)
- New admin view: `clinical-templates-admin-view.tsx`
- New view key: `clinical_templates` in app-store
- New permissions: `clinical_template.view`, `.create`, `.update`, `.approve`, `.activate`

---

## 3. BATCH OPERATIONS

### What exists ✅
- **Existing bulk action pattern**: `src/app/api/medications/bulk/route.ts` is the canonical example
  - POST with `{ ids: string[], action: string, value?: string }`
  - Validates `organizationId` in the `where` clause
  - Uses `db.medication.updateMany` with org-scoped filter
  - Single audit log entry per bulk action
  - Same pattern duplicated for: `insurance-claims/bulk`, `services/bulk`, `lab-tests/bulk`, `shifts/bulk`
- **Existing lab result entry flow** (`/api/lab-results` POST):
  - Single-result entry, with auto-flagging from catalog reference ranges
  - Already supports amendment via `amendedFromId` chain
  - Updates `LabOrderItem.status` and parent `LabOrder.status`
- **Existing prescription approval flow** (`/api/prescriptions/[id]` PATCH):
  - `action: "approve"` moves status from `pending` → `approved`
  - Already enforces "only pending can be approved" rule
- **Existing dispense flow** (`/api/dispense` POST) — transactional batch with inventory deduction, auto-billing, CDSS checks
- **Existing invoice creation flow** (`/api/invoices` POST) — transactional, with auto-calc totals, audit

### What's missing for Tier 2 ❌
- No bulk lab result entry endpoint (current is single-result only)
- No bulk invoice generation endpoint
- No bulk prescription approval endpoint (current is single-prescription PATCH)
- No batch job tracking (no `BatchOperation` or `BatchOperationItem` model)
- No idempotency keys for batch operations
- No partial-failure reporting pattern (current bulk routes return single `updated` count)

### What can be reused ✅
- `medications/bulk/route.ts` pattern as the template for new bulk endpoints
- `db.$transaction` for atomic multi-table operations
- Existing `auditLog()` helper for batch audit entries
- Existing `hasPermission()` for RBAC
- Existing `lab-result-flagging.ts` lib (auto-flagging logic — must be called for each row in bulk lab entry)
- Existing `nextInvoiceNumber()` helper (must be called per-invoice in bulk generation)
- Existing `checkDrugAllergy` / `checkDrugDrugInteractions` from CDSS engine (must run for each prescription in bulk approval)
- Existing `EncounterCoverage` / NHIS workflow logic (must NOT be bypassed by bulk invoice generation)

### What requires new architecture
- `BatchOperation` model (new) — tracks each batch run with status, count, summary, idempotency key
- `BatchOperationItem` model (new) — per-record outcome (success/skipped/failed + reason)
- New API routes:
  - `/api/lab-results/bulk` POST — bulk result entry with per-row validation
  - `/api/invoices/bulk` POST — bulk invoice generation with duplicate detection
  - `/api/prescriptions/bulk-approve` POST — bulk approval with safety checks
- New permissions: `lab_result.bulk_entry`, `invoice.bulk_generate`, `prescription.bulk_process`

---

## 4. EXISTING INFRASTRUCTURE TO REUSE

| Infrastructure | Where | Reuse Plan |
|---|---|---|
| RBAC | `src/lib/permissions.ts` (92 perms), `src/lib/session.ts#hasPermission` | Add ~12 new permissions for dashboard/templates/batch; don't touch existing |
| Audit log | `src/lib/session.ts#auditLog`, `AuditLog` model | Use same helper for all new actions; same model for batch tracking |
| Org/facility scoping | Every model has `organizationId` + most have `facilityId` | New models follow same pattern; queries always include scope |
| `db.$transaction` | Used in dispense, admissions, payments, stock transfers | Use for bulk operations where multiple records must succeed together |
| `@dnd-kit/core` | Installed but unused | Use for dashboard widget drag-and-drop |
| `useQuery` polling | `dashboard-view.tsx` refetchInterval: 30000 | Extend pattern; per-widget refresh intervals |
| shadcn/ui | All components in `src/components/ui/` | Use for all new UIs — Card, Dialog, Table, Form, etc. |
| `EmptyState` / `LoadingState` / `ErrorState` | `src/components/ui-helpers.tsx` | Use for all widget empty/loading/error states |
| `PageHeader`, `MiniStatCard` | `src/components/ui-helpers.tsx` | Use for admin views and widget cards |
| `DataTable` | `src/components/ui/data-table.tsx` | Use for template admin table, batch operation history |
| `FieldLabel` | `src/components/ui/required-label.tsx` | Use for template/batch forms |
| `ClearableSearch` | `src/components/ui-helpers.tsx` | Use for template search, batch worklist filter |
| `nextInvoiceNumber()`, `nextEncounterNumber()`, etc. | `src/lib/session.ts` | Use in bulk invoice generation |
| `safeJson()` | `src/components/ui-helpers.tsx` | Use for all new fetch helpers |

---

## 5. NHIS / NHIA CLAIM-IT — DO NOT BREAK

The following must remain untouched and continue to work end-to-end:

| Component | Location | Status |
|---|---|---|
| EncounterCoverage | `prisma/schema.prisma#model EncounterCoverage` (line 5270) | Working — verified in Phase 12 gate |
| EligibilityVerification | `prisma/schema.prisma#model EligibilityVerification` (line 5213) | Working — verified in Phase 12 gate |
| AttendanceVerification | `prisma/schema.prisma#model AttendanceVerification` (line 5319) | Working — verified in Phase 12 gate |
| ClaimReadinessAssessment | `prisma/schema.prisma#model ClaimReadinessAssessment` (line 5368) | Working |
| Claim readiness engine | `src/lib/nhis-workflow/claim-readiness-engine.ts` (701 lines) | Working — 108/108 upstream tests pass |
| Verification evidence | `src/lib/nhis-workflow/verification-evidence.ts` (226 lines) | Working |
| XML serialization | `src/integrations/nhia/claim-it/serialization/XMLSerializer.ts` | Working — 505/505 claim-it tests pass |
| CLAIM-it transport | `src/integrations/nhia/claim-it/transport/NHIAClaimItTransport.ts` | Working |
| Claim-it integration | `src/integrations/nhia/claim-it/` (full module) | Working — gate verified |

**Tier 2 must not modify any of these.** Bulk invoice generation must NOT auto-create insurance claims; it must only create `Invoice` records in `draft` status. The existing NHIS workflow will pick them up via the existing claim readiness engine.

---

## 6. DATA MODEL — EXISTING vs. NEW

### Existing models that will be referenced (not modified):
- `User` (1.2k lines) — references via `organizationId`, has `userRoles`
- `Organization`, `Facility`, `Department`, `Unit` — scoping
- `Patient`, `Encounter`, `Consultation` — clinical context for templates
- `LabOrder`, `LabOrderItem`, `LabResult` — created by template application + bulk entry
- `ImagingOrder`, `Procedure` — created by template application
- `Prescription`, `PrescriptionItem` — created by template application + bulk approval
- `Invoice`, `InvoiceItem` — created by bulk invoice generation
- `Service`, `FacilityServicePrice` — pricing for bulk invoice generation
- `AuditLog` — batch operation audit entries
- `Notification` — widget-driven notifications (already exists)
- `SystemSetting` — already supports org/facility-scoped JSON settings (could be used for dashboard defaults if needed)

### New models required:

```prisma
// === Dashboard ===
model DashboardLayout {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation("userDashboardLayout", fields: [userId], references: [id])
  organizationId  String
  facilityId      String?
  scope           String   @default("personal") // personal | role | department | facility
  roleCode        String?  // for role-scoped default layouts
  departmentId    String?  // for department-scoped
  isDefault       Boolean  @default(false)
  layout          String   // JSON: [{widgetId, x, y, w, h, config}]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([userId, organizationId, facilityId, scope])
  @@index([organizationId, scope, roleCode])
}

// === Clinical Templates ===
model ClinicalTemplate {
  id              String   @id @default(cuid())
  organizationId   String
  facilityId      String?
  departmentId    String?
  creatorId       String
  name            String
  description     String?
  templateType    String   // consultation | order_set | lab | imaging | medication | procedure | care
  category        String?  // e.g., "fever_workup", "hypertension_followup"
  specialty       String?
  scope           String   @default("organization") // system | organization | facility | department | personal
  status          String   @default("draft") // draft | under_review | approved | active | inactive | archived
  approverId      String?
  approvedAt      DateTime?
  currentVersionId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  versions        ClinicalTemplateVersion[]
  favorites       ClinicalTemplateFavorite[]
  applications    ClinicalTemplateApplication[]

  @@index([organizationId, status, templateType])
  @@index([organizationId, scope])
}

model ClinicalTemplateVersion {
  id              String   @id @default(cuid())
  templateId      String
  template        ClinicalTemplate @relation(fields: [templateId], references: [id])
  versionNumber   Int
  content         String   // JSON: { chiefComplaint?, hpi?, labItems[], imagingItems[], rxItems[], procedureItems[], serviceItems[], instructions? }
  effectiveDate   DateTime
  approvedById    String?
  approvedAt      DateTime?
  status          String   @default("draft") // draft | approved | active
  createdAt       DateTime @default(now())

  @@unique([templateId, versionNumber])
  @@index([templateId, versionNumber])
}

model ClinicalTemplateFavorite {
  id              String   @id @default(cuid())
  userId          String
  templateId      String
  template        ClinicalTemplate @relation(fields: [templateId], references: [id])
  pinned          Boolean  @default(false)
  lastUsedAt      DateTime?
  createdAt       DateTime @default(now())

  @@unique([userId, templateId])
}

model ClinicalTemplateApplication {
  id              String   @id @default(cuid())
  templateId      String
  template        ClinicalTemplate @relation(fields: [templateId], references: [id])
  templateVersionId String
  encounterId     String
  patientId       String
  appliedById     String
  appliedAt       DateTime @default(now())
  itemsCreated    String   // JSON: { labOrders: [], imagingOrders: [], prescriptions: [], procedures: [], services: [] }
  modified        Boolean  @default(false) // true if clinician modified proposed items before confirming

  @@index([templateId, appliedAt])
  @@index([encounterId])
}

// === Batch Operations ===
model BatchOperation {
  id              String   @id @default(cuid())
  organizationId   String
  facilityId      String?
  userId          String
  operationType   String   // bulk_lab_results | bulk_invoice_generation | bulk_prescription_approval
  idempotencyKey  String?  @unique
  status          String   @default("started") // started | completed | partially_completed | failed
  totalRecords    Int      @default(0)
  successCount    Int      @default(0)
  skippedCount    Int      @default(0)
  failedCount     Int      @default(0)
  summary         String?  // JSON
  startedAt       DateTime @default(now())
  completedAt     DateTime?

  items           BatchOperationItem[]

  @@index([organizationId, operationType, startedAt])
  @@index([userId, startedAt])
}

model BatchOperationItem {
  id              String   @id @default(cuid())
  batchOperationId String
  batch           BatchOperation @relation(fields: [batchOperationId], references: [id])
  recordType      String   // lab_result | invoice | prescription
  recordId        String?
  status          String   // success | skipped | failed
  reason          String?
  data            String?  // JSON: input data for this row
  createdAt       DateTime @default(now())

  @@index([batchOperationId, status])
}
```

### Back-relations to add to existing models:
- `User`: `dashboardLayouts DashboardLayout[] @relation("userDashboardLayout")`
- `Encounter`: `templateApplications ClinicalTemplateApplication[]`
- `Patient`: `templateApplications ClinicalTemplateApplication[]`

---

## 7. PERMISSIONS — EXISTING vs. NEW

### Existing (do not modify):
- All 92 permissions in `src/lib/permissions.ts` are working and verified.
- The `ROLE_PERMISSIONS` mapping covers all 13 default roles.

### New permissions to add (~12):
```ts
// Dashboard
DASHBOARD_VIEW: "dashboard.view",            // already implicitly granted via existing role access
DASHBOARD_CUSTOMIZE: "dashboard.customize", // NEW

// Clinical Templates
CLINICAL_TEMPLATE_VIEW: "clinical_template.view",
CLINICAL_TEMPLATE_CREATE: "clinical_template.create",
CLINICAL_TEMPLATE_UPDATE: "clinical_template.update",
CLINICAL_TEMPLATE_APPROVE: "clinical_template.approve",
CLINICAL_TEMPLATE_ACTIVATE: "clinical_template.activate",
CLINICAL_TEMPLATE_APPLY: "clinical_template.apply",

// Batch Operations
LAB_RESULT_BULK_ENTRY: "lab_result.bulk_entry",
INVOICE_BULK_GENERATE: "invoice.bulk_generate",
PRESCRIPTION_BULK_PROCESS: "prescription.bulk_process",
```

### Roles affected:
- `super_admin` — gets all new permissions (via `ALL_PERMISSIONS`)
- `organization_admin` — gets dashboard customize, template create/update/approve/activate, all batch
- `facility_admin` — gets dashboard customize, template create/update at facility scope, all batch
- `doctor` — gets dashboard customize, template view, template apply
- `nurse` — gets dashboard customize, template view, template apply (care templates only)
- `pharmacist` — gets dashboard customize, prescription bulk process
- `laboratory_scientist` — gets dashboard customize, lab result bulk entry
- `cashier` — gets dashboard customize
- `accountant` — gets dashboard customize, invoice bulk generate
- `records_officer` — gets dashboard customize
- `inventory_officer` — gets dashboard customize

---

## 8. SUMMARY — REUSE vs. NEW vs. EXTEND

| Area | Reuse | Extend | New |
|---|---|---|---|
| Dashboard | `ALL_KPIs` array, `/api/dashboard/stats` endpoint, role-permission gating, polling pattern | Extract to widget registry, add per-user layout, add drill-down, add widget config | `DashboardLayout` model, `/api/dashboard/layout` endpoint, drag-drop UI |
| Clinical Templates | All existing order endpoints (lab, imaging, rx, procedure), consultation model, audit, RBAC, org/facility scoping | None — this is genuinely new functionality | `ClinicalTemplate`, `ClinicalTemplateVersion`, `ClinicalTemplateFavorite`, `ClinicalTemplateApplication` models; 4 new API routes; 1 admin view; consultation integration UI |
| Batch Operations | `medications/bulk/route.ts` pattern, `db.$transaction`, `auditLog()`, auto-flagging, CDSS checks, `nextInvoiceNumber()`, NHIS workflow (must NOT be bypassed) | None — bulk endpoints are new | `BatchOperation`, `BatchOperationItem` models; 3 new bulk API routes; idempotency key handling |

---

## 9. PHASE 0 VERDICT

✅ **No functioning features need to be rebuilt.** The existing dashboard, clinical ordering, billing, and pharmacy workflows are all working and verified by the Phase 12 gate.

✅ **The codebase has all the infrastructure we need** — RBAC, audit, multi-tenancy, transactional integrity, CDSS, NHIS — all in place and verified.

✅ **The new functionality is genuinely additive** — it builds on top of existing endpoints, not replacing them.

⚠️ **The biggest risk is breaking NHIS workflows** during bulk invoice generation. Mitigation: bulk invoices will be created in `draft` status only, leaving the existing NHIS claim-readiness engine to pick them up via the existing flow.

⚠️ **The second biggest risk is bypassing CDSS** during bulk prescription approval. Mitigation: each prescription in a bulk batch will still call `checkDrugAllergy()` and `checkDrugDrugInteractions()` — if any check fails, that prescription is marked `requires_review` and skipped, not approved.

→ **Ready to proceed to Phase 1 (planning) and Phase 2 (dashboard widget registry implementation).**

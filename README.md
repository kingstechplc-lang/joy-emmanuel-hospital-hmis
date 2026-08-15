# Joy Emmanuel Hospital — HMIS

A complete, production-ready **Multi-facility Hospital Management Information System (HMIS/HIMS)** for Joy Emmanuel Hospital.

Built with **Next.js 16**, **TypeScript**, **Prisma ORM**, **NextAuth.js**, **shadcn/ui**, and **Tailwind CSS**.

> **Core Principle**: ONE PATIENT = ONE MASTER PATIENT RECORD. Patients are organization-level (NOT facility-owned); encounters are facility-specific. A patient registered at Facility A can visit Facility B without creating a duplicate record — their entire longitudinal medical history is preserved across all Joy Emmanuel Hospital facilities.

---

## 🏥 Features

### Clinical Modules
- **Patient Master Index** with duplicate detection (by Ghana Card, phone, name+DOB, insurance number)
- **Patient 360° Profile** — 12 tabs: Overview, Demographics, Encounters, Consultations, Vitals, Lab, Pharmacy, Diagnoses, Admissions, Billing, Documents, Audit
- **Cross-facility record access** — staff at any facility can search the central patient registry
- **OPD workflow** — Registration → Triage → Queue → Consultation → Investigation → Diagnosis → Prescription → Billing → Follow-up
- **Triage & Vitals** with auto-BMI calculation and 4-tier triage category
- **Consultations** with structured clinical documentation (HPI, PMH, PSH, FH, SH, ROS, PE, Assessment, Plan)
- **Appointments** with calendar (day/week/month views)
- **Queue management** with live per-department queues
- **Referrals** (internal + cross-facility)
- **Immunizations** with 25+ WHO EPI vaccine catalog
- **Maternity** with antenatal records and newborn registration

### Diagnostics
- **Laboratory** — full workflow: Order → Collect Sample → Process → Enter Result → Verify → Release → Amend
  - Lab result amendments preserve original via `amendedFromId` chain (never overwritten)
  - Critical results flagged with red badges
- **Imaging** — Order → Schedule → Perform → Report → Verify → Release
- **Procedures** with consent tracking

### Inpatient
- **Admissions** with transactional bed assignment
- **Bed Management** — visual ward board with double-booking prevention via DB transactions
- **Nursing Notes & Care Plans**
- **Discharges** with transactional bed release
- **Patient Transfers** (ward-to-ward + cross-facility)

### Pharmacy & Inventory
- **Prescriptions** with multi-item Rx, batch-level dispense
- **Dispensing workflow** with allergy warnings, inventory deduction, and auto-billing (transactional)
- **Inventory** with batch tracking, expiry dates, transaction ledger (every `currentQuantity` change creates an `InventoryTransaction`)
- **Purchase Orders** with goods receipt workflow
- **Stock Transfers** between facilities (transactional)
- **Equipment** with maintenance scheduling

### Finance
- **Invoices** with line items, auto-calculated totals, facility-specific pricing
- **Payments** with transactional balance update (atomic invoice + payment + receipt)
- **Refunds** workflow without touching original payment (audit trail preserved)
- **Insurance Claims** with NHIS/private insurance workflow

### Administration
- **Audit Logs** (server-side pagination, append-only)
- **Security Dashboard** — failed logins, locked accounts, break-glass events, patient access logs
- **Reports** — Patient, Clinical, Lab, Pharmacy, Financial, Operational reports with CSV export
- **Facilities / Departments / Units / Wards / Rooms / Beds** management
- **Users / Roles / Permissions** — 92 granular permissions, 13 default roles, custom roles supported
- **Services & Pricing** with facility-specific pricing
- **Lab Test Catalog**, **Medication Catalog**, **Insurance Providers**
- **System Settings** — currency, timezone, numbering formats

### Security
- **NextAuth.js** credentials authentication with bcrypt password hashing
- **Failed login tracking** with account lockout after 5 attempts
- **Role-Based Access Control** (RBAC) with facility + department scope
- **Audit logging** on every sensitive operation
- **Patient access logs** — every time a patient's record is viewed, it's logged
- **Break-glass access** for emergencies (auditable)
- **Defense in depth**: frontend permissions + backend authorization + database constraints

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Database | Prisma ORM (SQLite for sandbox; **portable to Neon PostgreSQL**) |
| Auth | NextAuth.js v4 with bcrypt |
| UI | shadcn/ui + Tailwind CSS 4 |
| State | Zustand (client) + TanStack Query v5 (server) |
| Charts | Recharts |
| Icons | lucide-react |
| Forms | react-hook-form + zod |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ 
- Bun (recommended) or npm
- SQLite (for development) or PostgreSQL/Neon (for production)

### Installation

```bash
# Clone the repository
git clone https://github.com/kingstechplc-lang/joy-emmanuel-hospital-hmis.git
cd joy-emmanuel-hospital-hmis

# Install dependencies
bun install
# or: npm install

# Set up environment variables
cp .env.example .env
# Edit .env to set DATABASE_URL and NEXTAUTH_SECRET

# Push database schema
bun run db:push

# Seed the database with org, facilities, roles, permissions, default users, and sample data
bun tsx scripts/seed.ts

# Start the development server
bun run dev
# or: npm run dev
```

Open http://localhost:3000 in your browser.

### Default Login Credentials

| Username | Role | Password |
|---|---|---|
| `superadmin` | Super Administrator | `Password@2026` |
| `orgadmin` | Organization Administrator | `Password@2026` |
| `facadmin` | Facility Administrator | `Password@2026` |
| `doctor` | Doctor / Medical Officer | `Password@2026` |
| `nurse` | Nurse | `Password@2026` |
| `pharmacist` | Pharmacist | `Password@2026` |
| `labscientist` | Laboratory Scientist | `Password@2026` |
| `radiographer` | Radiographer | `Password@2026` |
| `receptionist` | Receptionist | `Password@2026` |
| `cashier` | Cashier | `Password@2026` |
| `accountant` | Accountant | `Password@2026` |
| `records` | Records Officer | `Password@2026` |
| `inventory` | Inventory Officer | `Password@2026` |

> ⚠️ **Change these passwords immediately in production** via the Admin → Users panel.

---

## 📦 Seeded Data

The seed script (`scripts/seed.ts`) creates:

- **1 Organization**: Joy Emmanuel Hospital
- **3 Facilities**: Accra, Kasoa, Tema (each with 16 departments, 6 wards, 6 rooms × 6 beds)
- **13 Default Users** (one per role, see above)
- **92 Permissions** across 16 modules
- **13 Default Roles** with permission assignments
- **3 Insurance Providers**: NHIS, Acacia, Metropolitan
- **15 Lab Tests** (CBC, FBG, LFT, KFT, HIV, etc.)
- **18 Services** with facility-specific pricing
- **20 Medications** with strength/dosage form
- **30 Inventory Items** (medications + consumables) × 3 facilities with batches
- **4 Suppliers**
- **3 Sample Patients** with insurance, allergies, and medical history

The seed script is **idempotent** — it can be re-run safely without creating duplicates.

---

## 🗄️ Database Architecture

The Prisma schema (`prisma/schema.prisma`) defines **90+ tables** organized into 16 functional domains:

1. **Organization hierarchy**: organizations → facilities → departments → units; wards → rooms → beds
2. **Identity & access**: users, staff, staff_facilities, roles, permissions, role_permissions, user_roles
3. **Patient master index**: patients, patient_identifiers, patient_contacts, emergency_contacts, next_of_kin, insurance_providers, patient_insurance
4. **Encounters**: encounters, appointments, queues, queue_entries, triage_records, vital_signs
5. **Clinical**: consultations, diagnoses, allergies, medical_history, surgical_history, family_history, social_history
6. **Medications**: medications, prescriptions, prescription_items, medication_administration
7. **Laboratory**: laboratory_tests, lab_orders, lab_order_items, lab_samples, lab_results (with amendments)
8. **Imaging & procedures**: imaging_orders, imaging_reports, procedures
9. **Inpatient**: admissions, bed_assignments, patient_transfers, discharge_records, nursing_notes, care_plans
10. **Maternity**: maternity_records, newborn_records
11. **Billing**: services, facility_service_prices, invoices, invoice_items, payments, refunds, insurance_claims
12. **Inventory**: inventory_items, facility_inventory, inventory_batches, inventory_transactions, suppliers, purchase_orders, goods_received, stock_transfers
13. **Equipment**: equipment, equipment_maintenance
14. **HR**: staff_shifts, leave_records
15. **Operations**: documents, consents, tasks, notifications
16. **Compliance**: audit_logs, patient_access_logs, break_glass_events, system_settings, patient_merge_events

### Porting to Neon PostgreSQL

The schema is portable to Neon PostgreSQL. To switch:

1. Change the `datasource` in `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL` to your Neon connection string in `.env`
3. Run `bun run db:push` to create the schema on Neon

---

## 🏗️ Architecture Highlights

### ONE PATIENT = ONE MASTER RECORD
Patients are organization-level (NOT facility-owned). Encounters are facility-specific and reference the same `patient_id`. A patient registered at Facility A can visit Facility B without creating a duplicate.

### Multi-facility Support
- Users can switch facility in the topbar
- Data is scoped server-side via `facilityId` query parameter
- Staff can be assigned to multiple facilities via `staff_facilities` table
- Roles can be scoped to a specific facility via `user_roles.facilityId`

### Transactional Integrity
Critical operations are atomic via `db.$transaction`:
- **Admission**: create admission + assign bed (set bed.status='occupied') + create BedAssignment
- **Discharge**: create discharge record + set admission.status='discharged' + release bed + close encounter
- **Pharmacy dispense**: decrement batch + decrement inventory + update prescription item + create InventoryTransaction + auto-bill invoice
- **Payment**: create payment + update invoice balance + change invoice status (paid/partially_paid)
- **Stock transfer**: decrement source inventory + increment destination inventory + create transfer_out/transfer_in transactions
- **Goods received**: create batch + increment inventory + create receive transaction

### Bed Double-Booking Prevention
Bed assignments use DB transactions with row-level checks — two nurses cannot assign the same bed simultaneously.

### Inventory Integrity
Every `currentQuantity` change creates an `InventoryTransaction` record. Inventory is never silently overwritten — the full transaction ledger preserves the audit trail.

### Lab Result Amendments
Verified lab results cannot be overwritten. Amendments create a new `LabResult` row with `amendedFromId` pointing to the original, preserving the full chain.

### Audit Logging
Every sensitive operation writes an `AuditLog` entry:
- `PATIENT_CREATED`, `PATIENT_VIEWED`, `PATIENT_UPDATED`, `PATIENT_MERGED`
- `LAB_RESULT_VERIFIED`, `LAB_RESULT_AMENDED`
- `INVOICE_CREATED`, `PAYMENT_RECEIVED`, `REFUND_PROCESSED`
- `BED_ASSIGNED`, `PATIENT_TRANSFERRED`, `PATIENT_DISCHARGED`
- `USER_CREATED`, `ROLE_CHANGED`, `PERMISSION_CHANGED`
- `BREAK_GLASS_USED`, `DATA_EXPORTED`

Plus separate `PatientAccessLog` entries for every patient record view.

---

## 📂 Project Structure

```
prisma/
  schema.prisma              # 90+ tables, fully normalized
scripts/
  seed.ts                    # Comprehensive seed script (idempotent)
src/
  app/
    api/                     # ~50 API route files
      auth/[...nextauth]/
      patients/              # CRUD with duplicate detection
      encounters/, appointments/, queue/, triage/, consultations/
      lab-orders/, lab-results/, imaging/, procedures/
      admissions/, beds/ (with assign/release), nursing/, discharges/, transfers/
      invoices/, payments/, refunds/, insurance-claims/
      inventory/, suppliers/, purchase-orders/, stock-transfers/, equipment/
      prescriptions/, dispense/, medications/
      staff/, shifts/, documents/, tasks/
      audit-logs/, security/, reports/[type]/
      facilities/, departments/, users/, roles/, permissions/
      services/, lab-tests/, insurance-providers/, system-settings/
      dashboard/stats/, notifications/
    page.tsx                 # SPA entry (login or app shell)
    layout.tsx              # Root layout with providers
  components/
    layout/
      app-shell.tsx         # Sidebar + topbar + facility switcher + notifications
    views/
      login-view.tsx        # Login screen with quick-fill demo accounts
      dashboard-view.tsx    # Real KPI dashboard with 10 stat cards
      patients/             # 3 views (list, registration, 360°)
      clinical/             # 8 clinical views
      lab/, imaging/, procedures/  # 4 diagnostic views
      inpatient/            # 5 inpatient views
      billing/              # 4 billing views
      inventory/            # 5 inventory views
      pharmacy/             # 2 pharmacy views
      hr/                   # 2 HR views
      operations/           # 2 operations views
      admin/                # 13 admin views
      view-renderer.tsx     # Permission-gated view router
    providers/              # NextAuth, Theme, Query providers
    ui/                     # shadcn/ui components (50+)
    ui-helpers.tsx          # EmptyState, LoadingState, ErrorState, StatusBadge, formatters
  lib/
    auth.ts                 # NextAuth config (credentials + bcrypt)
    session.ts              # getSession, hasPermission, auditLog, next*Number helpers
    permissions.ts          # 92 PERMISSIONS + ROLE_PERMISSIONS mapping
    db.ts                   # Prisma client singleton
    utils.ts                # cn() className helper
  stores/
    app-store.ts            # Zustand SPA navigation (50 views, 9 categories)
.env.example                # Environment variable template
```

---

## 🔐 Environment Variables

Create a `.env` file in the project root:

```env
# Database (SQLite for development, PostgreSQL/Neon for production)
DATABASE_URL="file:./db/custom.db"
# For Neon PostgreSQL:
# DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# NextAuth
NEXTAUTH_SECRET="your-super-secret-string-here"
NEXTAUTH_URL="http://localhost:3000"
```

> ⚠️ **Never commit `.env` to git**. The `.gitignore` already excludes it.

---

## 🧪 Testing the Workflows

### End-to-End Clinical Workflow
1. Log in as `receptionist` → register a new patient (try registering twice to see duplicate detection)
2. Log in as `doctor` → create an encounter for the patient → record triage → write consultation → order lab test → prescribe medication
3. Log in as `labscientist` → collect sample → enter result → verify → release
4. Log in as `pharmacist` → approve prescription → dispense (with batch selection)
5. Log in as `cashier` → create invoice → record payment
6. Log in as `superadmin` → check audit logs to see every action recorded

### Multi-facility Test
1. Log in as `superadmin`
2. Use the facility switcher in the topbar to switch between Accra/Kasoa/Tema
3. Verify that data (encounters, inventory, beds) is scoped per facility
4. Register a patient at Facility A → switch to Facility B → search the same patient → create encounter at Facility B (no duplicate patient created)

---

## 📊 Default Roles & Permissions

The system ships with 13 default roles and 92 granular permissions:

- **super_admin** — full access to everything
- **organization_admin** — org-wide management (no super_admin powers)
- **facility_admin** — facility-scoped management
- **doctor** — clinical workflows (consult, prescribe, admit, sign notes)
- **nurse** — triage, vitals, nursing notes, bed management
- **pharmacist** — dispense, inventory, procurement
- **laboratory_scientist** — lab orders, results, verification, amendment
- **radiographer** — imaging orders, reports, verification
- **receptionist** — patient registration, appointments, encounters
- **cashier** — billing, payments
- **accountant** — full finance, refunds, insurance claims, reports
- **records_officer** — patient merge, document management, exports
- **inventory_officer** — inventory, procurement, stock transfers

Custom roles can be created via Admin → Roles.

---

## 🛡️ Security Notes

- Passwords are bcrypt-hashed (never stored in plain text)
- Account lockout after 5 failed login attempts (15-minute lockout)
- Session timeout: 8 hours
- All sensitive API endpoints require authentication + permission check
- Audit logs are append-only (no PATCH/DELETE endpoints)
- Patient access is logged separately for HIPAA-style compliance
- The schema is designed for Row-Level Security (RLS) on PostgreSQL

### Production Hardening Checklist
- [ ] Change all default user passwords
- [ ] Set a strong `NEXTAUTH_SECRET` (use `openssl rand -base64 32`)
- [ ] Switch to PostgreSQL/Neon for production
- [ ] Enable HTTPS (use Vercel, Cloudflare, or a reverse proxy)
- [ ] Configure backup strategy for the database
- [ ] Review and customize role permissions per hospital policy
- [ ] Set up monitoring (Sentry, Datadog, or similar)
- [ ] Conduct security review with hospital compliance team
- [ ] Validate against Ghanaian Data Protection Act requirements

---

## 📝 License

This project is proprietary to Joy Emmanuel Hospital. All rights reserved.

---

## 🤝 Contributing

This is a private project for Joy Emmanuel Hospital. For changes, please coordinate with the hospital's IT department.

// =====================================================================
// SERVER-SIDE AUTH UTILITIES
// =====================================================================
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { PermissionCode } from "@/lib/permissions";

export type AppSession = {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    username: string;
    role: string;
    roles: string[];
    organizationId: string;
    facilityId: string | null;
    departmentId: string | null;
    permissions: string[];
  };
};

export async function getSession(): Promise<AppSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session as unknown as AppSession;
}

export async function requireAuth(): Promise<AppSession> {
  const session = await getSession();
  if (!session) redirect("/");
  return session;
}

export function hasPermission(session: AppSession | null, permission: PermissionCode | string): boolean {
  if (!session) return false;
  if (session.user.roles.includes("super_admin")) return true;
  return (session.user.permissions || []).includes(permission);
}

export function hasAnyPermission(session: AppSession | null, permissions: (PermissionCode | string)[]): boolean {
  if (!session) return false;
  if (session.user.roles.includes("super_admin")) return true;
  const perms = session.user.permissions || [];
  return permissions.some((p) => perms.includes(p));
}

// =====================================================================
// AUDIT LOG HELPER
// =====================================================================
export async function auditLog(params: {
  userId?: string;
  organizationId?: string;
  facilityId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId || null,
        organizationId: params.organizationId || null,
        facilityId: params.facilityId || null,
        action: params.action,
        resourceType: params.resourceType || null,
        resourceId: params.resourceId || null,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        reason: params.reason || null,
      },
    });
  } catch (e) {
    // Don't fail the operation if audit logging fails
    console.error("auditLog failed:", e);
  }
}

// =====================================================================
// NUMBERING HELPERS (JEM-0000001, ENC-2026-000001, etc.)
// =====================================================================
export async function nextPatientNumber(orgId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await db.patient.count({ where: { organizationId: orgId } });
    const candidate = `JEM-${String(count + 1 + attempt).padStart(7, "0")}`;
    const existing = await db.patient.findFirst({
      where: { organizationId: orgId, patientNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `JEM-${timestamp}`;
}

export async function nextEncounterNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  // Retry loop for concurrency safety — the @@unique([facilityId, encounterNumber])
  // constraint will reject duplicates; we retry with incremented counters until success.
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await db.encounter.count({ where: { facilityId } });
    const candidate = `ENC-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    // Check if this number already exists (handles year-rollover + deletion gaps)
    const existing = await db.encounter.findFirst({
      where: { facilityId, encounterNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  // Fallback: use a timestamp-based suffix to guarantee uniqueness
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `ENC-${year}-${timestamp}`;
}

export async function nextInvoiceNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await db.invoice.count({ where: { facilityId } });
    const candidate = `INV-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const existing = await db.invoice.findFirst({
      where: { facilityId, invoiceNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `INV-${year}-${timestamp}`;
}

export async function nextPaymentNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await db.payment.count({ where: { facilityId } });
    const candidate = `PAY-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const existing = await db.payment.findFirst({
      where: { facilityId, paymentNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `PAY-${year}-${timestamp}`;
}

export async function nextPrescriptionNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await db.prescription.count({ where: { facilityId } });
    const candidate = `RX-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const existing = await db.prescription.findFirst({
      where: { facilityId, prescriptionNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `RX-${year}-${timestamp}`;
}

export async function nextLabOrderNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await db.labOrder.count({ where: { facilityId } });
    const candidate = `LAB-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const existing = await db.labOrder.findFirst({
      where: { facilityId, labOrderNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `LAB-${year}-${timestamp}`;
}

export async function nextAdmissionNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await db.admission.count({ where: { facilityId } });
    const candidate = `ADM-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const existing = await db.admission.findFirst({
      where: { facilityId, admissionNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `ADM-${year}-${timestamp}`;
}

export async function nextAppointmentNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await db.appointment.count({ where: { facilityId } });
    const candidate = `APT-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const existing = await db.appointment.findFirst({
      where: { facilityId, appointmentNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `APT-${year}-${timestamp}`;
}

export async function nextPurchaseOrderNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await db.purchaseOrder.count({ where: { facilityId } });
    const candidate = `PO-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const existing = await db.purchaseOrder.findFirst({
      where: { facilityId, purchaseOrderNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `PO-${year}-${timestamp}`;
}

export async function nextClaimNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await db.insuranceClaim.count({ where: { facilityId } });
    const candidate = `CLM-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    const existing = await db.insuranceClaim.findFirst({
      where: { facilityId, claimNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `CLM-${year}-${timestamp}`;
}

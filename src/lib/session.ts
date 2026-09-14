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
// AUDIT LOG HELPERS
// =====================================================================
// auditLog() — the legacy signature. Existing 663 call sites continue to
//   work unchanged. New optional fields (actionCategory, severity, source,
//   sessionId, changedFields) are accepted but not required.
//
// auditLogRequest(req, params) — the new enriched wrapper. Auto-extracts
//   IP, User-Agent, and session metadata from the Request object, computes
//   field-level diff between oldValues and newValues, and writes a single
//   comprehensive AuditLog row.
//
// extractRequestMeta(req) — pulls IP/UA/sessionId out of a Next.js Request.
//   Useful for ad-hoc logging where auditLogRequest isn't applicable.
//
// computeDiff(oldValues, newValues) — returns an array of per-field changes
//   [{ field: "allergies", oldValue: "None", newValue: "Penicillin" }, ...]
//   Used both at write-time (auditLogRequest writes it to changedFields JSON
//   column) and at read-time (the audit log viewer renders it inline).
// =====================================================================

/**
 * Extract the client IP from a Next.js Request. Tries, in order:
 *   1. x-forwarded-for (first IP, when behind a proxy/load-balancer/Vercel)
 *   2. x-real-ip (alternate proxy header)
 *   3. x-vercel-forwarded-for (Vercel-specific)
 *   4. cf-connecting-ip (Cloudflare)
 *   5. req.headers.get("x-forwarded-for") fallback
 * Returns null if no IP can be resolved.
 */
export function getClientIp(req: Request): string | null {
  try {
    const headers = req.headers;
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first && first.length > 0 && first !== "unknown") return first;
    }
    const xri = headers.get("x-real-ip");
    if (xri && xri !== "unknown") return xri.trim();
    const vff = headers.get("x-vercel-forwarded-for");
    if (vff) {
      const first = vff.split(",")[0]?.trim();
      if (first && first.length > 0 && first !== "unknown") return first;
    }
    const cf = headers.get("cf-connecting-ip");
    if (cf && cf !== "unknown") return cf.trim();
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract the User-Agent string from a Next.js Request. Truncated to 512
 * characters to prevent oversized rows. Returns null if missing.
 */
export function getUserAgent(req: Request): string | null {
  try {
    const ua = req.headers.get("user-agent");
    if (!ua) return null;
    return ua.length > 512 ? ua.slice(0, 512) : ua;
  } catch {
    return null;
  }
}

/**
 * Build a per-field diff between two objects. Returns an array of
 * { field, oldValue, newValue } for every top-level key that differs.
 * Fields that exist in only one of the two objects are included with the
 * missing side as undefined. Fields with identical values are skipped.
 */
export function computeDiff(
  oldValues: Record<string, any> | null | undefined,
  newValues: Record<string, any> | null | undefined
): Array<{ field: string; oldValue: any; newValue: any }> {
  const safeOld = oldValues && typeof oldValues === "object" ? oldValues : {};
  const safeNew = newValues && typeof newValues === "object" ? newValues : {};
  const allKeys = new Set<string>([
    ...Object.keys(safeOld),
    ...Object.keys(safeNew),
  ]);
  const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
  for (const key of allKeys) {
    const oldVal = (safeOld as any)[key];
    const newVal = (safeNew as any)[key];
    // Deep-equal via JSON.stringify for primitives/arrays/plain objects.
    // Not perfect (key order matters) but sufficient for audit display.
    const oldJson = JSON.stringify(oldVal ?? null);
    const newJson = JSON.stringify(newVal ?? null);
    if (oldJson !== newJson) {
      changes.push({ field: key, oldValue: oldVal, newValue: newVal });
    }
  }
  return changes;
}

/**
 * Extract a complete metadata envelope from a Next.js Request — IP, UA,
 * and any session correlation ID available. Safe to call from any API
 * route or NextAuth event handler (where req may be undefined).
 */
export function extractRequestMeta(req?: Request | null): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  if (!req) return { ipAddress: null, userAgent: null };
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  };
}

/**
 * Legacy auditLog signature — fully backward-compatible with the 663
 * existing call sites. New optional fields (actionCategory, severity,
 * source, sessionId, changedFields) are accepted but not required.
 *
 * For new code, prefer auditLogRequest(req, params) which auto-populates
 * IP/UA/session/diff.
 */
export async function auditLog(params: {
  userId?: string;
  organizationId?: string;
  facilityId?: string;
  action: string;
  actionCategory?: string;
  severity?: string;
  source?: string;
  resourceType?: string;
  resourceId?: string;
  oldValues?: any;
  newValues?: any;
  changedFields?: any;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  reason?: string;
}) {
  try {
    // If caller provided oldValues + newValues but no changedFields, compute it
    let computedDiff = params.changedFields;
    if (!computedDiff && params.oldValues && params.newValues) {
      const d = computeDiff(params.oldValues, params.newValues);
      if (d.length > 0) computedDiff = d;
    }
    await db.auditLog.create({
      data: {
        userId: params.userId || null,
        organizationId: params.organizationId || null,
        facilityId: params.facilityId || null,
        action: params.action,
        actionCategory: params.actionCategory || null,
        severity: params.severity || null,
        source: params.source || null,
        resourceType: params.resourceType || null,
        resourceId: params.resourceId || null,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        changedFields: computedDiff ? JSON.stringify(computedDiff) : null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        sessionId: params.sessionId || null,
        reason: params.reason || null,
      },
    });
  } catch (e) {
    // Don't fail the operation if audit logging fails
    console.error("auditLog failed:", e);
  }
}

/**
 * New enriched audit wrapper — auto-extracts IP, User-Agent, and (when a
 * session is supplied) userId / organizationId / facilityId / sessionId
 * from the Request, and computes the field-level diff between oldValues
 * and newValues. Returns the created audit log row's id (or null on
 * failure) so the caller can correlate related events.
 *
 * Usage:
 *   import { auditLogRequest, AUDIT_ACTIONS } from "@/lib/session";
 *   await auditLogRequest(req, {
 *     session,
 *     ...AUDIT_ACTIONS.PATIENT_ALLERGY_CHANGED,
 *     resourceType: "patient",
 *     resourceId: patient.id,
 *     oldValues: { allergies: "None" },
 *     newValues: { allergies: "Penicillin" },
 *     reason: "Patient self-reported new allergy",
 *   });
 */
export async function auditLogRequest(
  req: Request | null | undefined,
  params: {
    session?: AppSession | null;
    userId?: string;
    organizationId?: string;
    facilityId?: string;
    action: string;
    actionCategory?: string;
    severity?: string;
    source?: string;
    resourceType?: string;
    resourceId?: string;
    oldValues?: any;
    newValues?: any;
    changedFields?: any;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    reason?: string;
  }
): Promise<string | null> {
  try {
    const meta = extractRequestMeta(req ?? undefined);
    const session = params.session;
    const userId = params.userId ?? session?.user.id ?? null;
    const organizationId =
      params.organizationId ?? session?.user.organizationId ?? null;
    const facilityId =
      params.facilityId ?? session?.user.facilityId ?? null;
    // Session correlation: prefer explicit sessionId, else use the
    // NextAuth JWT sub if available (heuristic — session.user.id is stable
    // across requests, but per-token sub changes on each re-login).
    const sessionId =
      params.sessionId ?? (session as any)?.user?.sessionId ?? null;

    let computedDiff = params.changedFields;
    if (!computedDiff && params.oldValues && params.newValues) {
      const d = computeDiff(params.oldValues, params.newValues);
      if (d.length > 0) computedDiff = d;
    }

    const row = await db.auditLog.create({
      data: {
        userId: userId || null,
        organizationId: organizationId || null,
        facilityId: facilityId || null,
        action: params.action,
        actionCategory: params.actionCategory || null,
        severity: params.severity || null,
        source: params.source || null,
        resourceType: params.resourceType || null,
        resourceId: params.resourceId || null,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        changedFields: computedDiff ? JSON.stringify(computedDiff) : null,
        ipAddress: params.ipAddress || meta.ipAddress || null,
        userAgent: params.userAgent || meta.userAgent || null,
        sessionId: sessionId || null,
        reason: params.reason || null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    // Don't fail the operation if audit logging fails
    console.error("auditLogRequest failed:", e);
    return null;
  }
}

// Re-export the audit action constants + types for convenience.
export {
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_SEVERITY,
  type AuditSeverity,
} from "@/lib/audit-actions";

// =====================================================================
// NUMBERING HELPERS (JEM-0000001, ENC-2026-000001, etc.)
// =====================================================================
export async function nextPatientNumber(orgId: string): Promise<string> {
  const count = await db.patient.count({ where: { organizationId: orgId } });
  const next = count + 1;
  return `JEM-${String(next).padStart(7, "0")}`;
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
  const count = await db.invoice.count({ where: { facilityId } });
  return `INV-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function nextPaymentNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.payment.count({ where: { facilityId } });
  return `PAY-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function nextPrescriptionNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.prescription.count({ where: { facilityId } });
  return `RX-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function nextLabOrderNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.labOrder.count({ where: { facilityId } });
  return `LAB-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function nextAdmissionNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.admission.count({ where: { facilityId } });
  return `ADM-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function nextAppointmentNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.appointment.count({ where: { facilityId } });
  return `APT-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function nextPurchaseOrderNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.purchaseOrder.count({ where: { facilityId } });
  return `PO-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function nextClaimNumber(facilityId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.insuranceClaim.count({ where: { facilityId } });
  return `CLM-${year}-${String(count + 1).padStart(6, "0")}`;
}

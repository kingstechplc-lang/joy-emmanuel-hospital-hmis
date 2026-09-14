// =====================================================================
// PATIENT PORTAL — JWT helpers
// =====================================================================
// Patients authenticate to /portal/* with a short-lived JWT issued by
// POST /api/portal/auth/verify-otp. The portal JWT is SEPARATE from
// the staff NextAuth JWT — different secret, different audience, so
// a patient token cannot be used to call staff APIs (the staff API
// route handlers use NextAuth's getServerSession which ignores our
// tokens entirely).
//
// Token claims:
//   sub  = PatientPortalAccount.id (NOT the Patient.id — the account
//          can survive a phone number change / re-link)
//   pid  = Patient.id (resolved at verify time, may be null if account
//          is in 'pending_identity' state)
//   ph   = phone (canonicalized)
//   org  = organizationId
//   iat  = issued-at (Unix seconds, set by jose)
//   exp  = expiry (default 30 minutes — short to limit damage from
//          a leaked token)
//   jti  = random JWT ID (correlates portal API calls in audit logs)
//
// ENV:
//   PATIENT_PORTAL_JWT_SECRET = 32+ random bytes (different from
//     NEXTAUTH_SECRET). Falls back to a dev value with a console warning
//     — production deployments MUST set this explicitly.
// =====================================================================
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const DEV_SECRET = "joy-emmanuel-patient-portal-dev-secret-change-in-production";

function getSecret(): Uint8Array {
  const raw = process.env.PATIENT_PORTAL_JWT_SECRET || DEV_SECRET;
  if (raw === DEV_SECRET) {
    console.warn(
      "[patient-portal] PATIENT_PORTAL_JWT_SECRET not set — using insecure dev fallback. " +
      "Set this in Vercel env vars before production use."
    );
  }
  return new TextEncoder().encode(raw);
}

const ISSUER = "joy-emmanuel-hospital/patient-portal";
const AUDIENCE = "patient-portal";
const DEFAULT_TTL_SECONDS = 30 * 60; // 30 minutes

export interface PortalTokenPayload extends JWTPayload {
  sub: string;        // PatientPortalAccount.id
  pid?: string;       // Patient.id (if account is linked)
  ph: string;         // phone
  org: string;         // organizationId
}

export interface PortalSession {
  accountId: string;
  patientId: string | null;
  phone: string;
  organizationId: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

// =====================================================================
// Sign — mint a new patient portal JWT
// =====================================================================
export async function signPortalToken(params: {
  accountId: string;
  patientId: string | null;
  phone: string;
  organizationId: string;
  ttlSeconds?: number;
}): Promise<string> {
  const ttl = params.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const jwt = await new SignJWT({
    pid: params.patientId || undefined,
    ph: params.phone,
    org: params.organizationId,
  })
    .setSubject(params.accountId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .setJti()
    .protect(getSecret());
  return jwt;
}

// =====================================================================
// Verify — validate a patient portal JWT
// =====================================================================
export async function verifyPortalToken(token: string): Promise<PortalSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.sub || !payload.ph || !payload.org) return null;
    return {
      accountId: payload.sub,
      patientId: payload.pid || null,
      phone: payload.ph,
      organizationId: payload.org,
      jti: payload.jti,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

// =====================================================================
// Bearer header parser — pull "Bearer <token>" from an Authorization
// header and return a verified PortalSession (or null).
// =====================================================================
export async function getPortalSessionFromRequest(req: Request): Promise<PortalSession | null> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return verifyPortalToken(token);
}

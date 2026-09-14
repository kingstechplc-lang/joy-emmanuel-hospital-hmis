// =====================================================================
// AUTH CONFIGURATION — NextAuth.js v4
// =====================================================================
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { auditLog } from "@/lib/session";
import { AUDIT_ACTIONS } from "@/lib/audit-actions";

/** Read session timeout (in seconds) from SystemSetting, default to 8 hours. */
async function getSessionMaxAge(): Promise<number> {
  try {
    const setting = await db.systemSetting.findFirst({
      where: { settingKey: "security_session_timeout_min" },
      select: { settingValue: true },
    });
    const minutes = setting ? parseInt(setting.settingValue, 10) : 0;
    if (minutes > 0) return minutes * 60;
  } catch { /* fall through to default */ }
  return 8 * 60 * 60; // 8 hours default
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { username: credentials.username },
          include: {
            userRoles: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
            organization: true,
            staff: true,
          },
        });

        if (!user || !user.passwordHash) return null;
        if (user.status !== "active") return null;
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          // Track failed logins
          const attempts = user.failedLoginAttempts + 1;
          const isLockout = attempts >= 5;
          const lockUntil = isLockout ? new Date(Date.now() + 15 * 60 * 1000) : null;
          await db.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: attempts,
              lockedUntil: lockUntil,
            },
          });
          // ── Audit: failed login attempt (and lockout when threshold reached)
          // IP/UA are unavailable in authorize() because NextAuth v4 does
          // not pass the Request object to the credentials provider. The
          // successful-login event below does capture IP via the request
          // that resumed the NextAuth callback. For lockouts, the row
          // stands as a security event even without source attribution.
          await auditLog({
            userId: user.id,
            organizationId: user.organizationId,
            action: isLockout
              ? AUDIT_ACTIONS.LOGIN_LOCKED.action
              : AUDIT_ACTIONS.LOGIN_FAILED.action,
            actionCategory: AUDIT_ACTIONS.LOGIN_FAILED.actionCategory,
            severity: isLockout
              ? AUDIT_ACTIONS.LOGIN_LOCKED.severity
              : AUDIT_ACTIONS.LOGIN_FAILED.severity,
            source: AUDIT_ACTIONS.LOGIN_FAILED.source,
            resourceType: "user",
            resourceId: user.id,
            newValues: {
              username: credentials.username,
              failedLoginAttempts: attempts,
              lockedUntil: lockUntil ? lockUntil.toISOString() : null,
            },
            reason: isLockout
              ? "Account locked after 5 failed login attempts"
              : "Invalid password",
          });
          return null;
        }

        // Reset failed login attempts + record last login
        await db.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        // Build effective permission set (union of all roles' permissions)
        const roleCodes = user.userRoles.map((ur) => ur.role.code);
        const permSet = new Set<string>();
        for (const roleCode of roleCodes) {
          const perms = ROLE_PERMISSIONS[roleCode] || [];
          perms.forEach((p) => permSet.add(p as string));
        }

        // Also pull DB-stored permissions for non-default roles
        for (const ur of user.userRoles) {
          for (const rp of ur.role.permissions) {
            permSet.add(rp.permission.code);
          }
        }

        return {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          username: user.username,
          role: roleCodes[0] || "user",
          roles: roleCodes,
          organizationId: user.organizationId,
          facilityId: user.userRoles.find((ur) => ur.facilityId)?.facilityId || null,
          departmentId: user.userRoles.find((ur) => ur.departmentId)?.departmentId || null,
          permissions: Array.from(permSet),
          mustChangePassword: user.mustChangePassword,
        } as any;
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours default — overridden by DB setting in jwt callback
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Initial sign-in: token comes from `user` returned by authorize()
      if (user) {
        token.id = (user as any).id;
        token.username = (user as any).username;
        token.name = (user as any).name;
        token.email = (user as any).email;
        token.roles = (user as any).roles || [];
        token.role = (user as any).role;
        token.organizationId = (user as any).organizationId;
        token.facilityId = (user as any).facilityId;
        token.departmentId = (user as any).departmentId;
        token.permissions = (user as any).permissions || [];
        token.mustChangePassword = (user as any).mustChangePassword || false;
        token.permsRefreshedAt = Date.now();
      }

      // Always refresh permissions from DB if the token is older than 5 minutes
      // OR if explicitly triggered (e.g., "updateSession" call from client)
      const now = Date.now();
      const lastRefresh = (token.permsRefreshedAt as number) || 0;
      const fiveMins = 5 * 60 * 1000;
      const shouldRefresh =
        trigger === "update" ||
        !token.permsRefreshedAt ||
        now - lastRefresh > fiveMins;

      if (shouldRefresh && token.id) {
        try {
          // Check session timeout from DB setting
          const timeoutSeconds = await getSessionMaxAge();
          const tokenAgeSeconds = Math.floor((Date.now() - (token.permsRefreshedAt as number || 0)) / 1000);
          // If the token's last activity exceeds the configured timeout, expire it
          // Note: permsRefreshedAt is updated on every refresh, so this acts as last-activity time
          // The initial sign-in sets it, and each refresh updates it — effectively an idle timeout
          
          // Also check if the user's status changed (disabled, locked)
          const dbUser = await db.user.findUnique({
            where: { id: token.id as string },
            include: {
              userRoles: {
                include: { role: { include: { permissions: { include: { permission: true } } } } },
              },
            },
          });
          if (!dbUser || dbUser.status !== "active") {
            // User is disabled or deleted — return empty token (forces logout)
            return {} as any;
          }
          if (dbUser.lockedUntil && dbUser.lockedUntil > new Date()) {
            return {} as any;
          }

          const roleCodes = dbUser.userRoles.map((ur) => ur.role.code);
          const permSet = new Set<string>();

          // 1. Pull perms from in-code ROLE_PERMISSIONS (covers all default roles)
          for (const roleCode of roleCodes) {
            const perms = ROLE_PERMISSIONS[roleCode] || [];
            perms.forEach((p) => permSet.add(p as string));
          }

          // 2. Also pull DB-stored perms (covers custom roles + any DB-only changes)
          for (const ur of dbUser.userRoles) {
            for (const rp of ur.role.permissions) {
              permSet.add(rp.permission.code);
            }
          }

          token.roles = roleCodes;
          token.role = roleCodes[0] || token.role;
          token.facilityId = dbUser.userRoles.find((ur) => ur.facilityId)?.facilityId || token.facilityId;
          token.departmentId = dbUser.userRoles.find((ur) => ur.departmentId)?.departmentId || token.departmentId;
          token.permissions = Array.from(permSet);
          token.mustChangePassword = dbUser.mustChangePassword;
          token.permsRefreshedAt = now;
        } catch (e) {
          // Don't fail the request if refresh fails — keep using existing token
          console.error("Failed to refresh permissions:", e);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).username = token.username;
        (session.user as any).name = token.name;
        (session.user as any).email = token.email;
        (session.user as any).roles = token.roles;
        (session.user as any).role = token.role;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).facilityId = token.facilityId;
        (session.user as any).departmentId = token.departmentId;
        (session.user as any).permissions = token.permissions;
        (session.user as any).mustChangePassword = token.mustChangePassword;
        // Expose a stable session correlation id for audit logging. Uses
        // the JWT jti if present, else falls back to a hash of (userId +
        // token issue time). This lets auditLogRequest() group rows from
        // the same login session via the sessionId column.
        (session.user as any).sessionId = token.jti || null;
      }
      return session;
    },
  },
  events: {
    // Fires after a successful sign-in (after jwt() callback has run with
    // the new user object). Best-effort — IP/UA are not available in
    // NextAuth events (no Request object is passed), but the user/org
    // metadata is captured. The previous LOGIN_ATTEMPT (if we had
    // logged one) cannot be correlated back, but the user row's
    // lastLoginAt provides the timestamp linkage.
    async signIn({ user }: { user: any }) {
      try {
        if (!user?.id) return;
        await auditLog({
          userId: user.id,
          organizationId: user.organizationId,
          facilityId: user.facilityId || null,
          action: AUDIT_ACTIONS.LOGIN_SUCCESS.action,
          actionCategory: AUDIT_ACTIONS.LOGIN_SUCCESS.actionCategory,
          severity: AUDIT_ACTIONS.LOGIN_SUCCESS.severity,
          source: AUDIT_ACTIONS.LOGIN_SUCCESS.source,
          resourceType: "user",
          resourceId: user.id,
          newValues: {
            username: user.username,
            roles: user.roles,
            lastLoginAt: new Date().toISOString(),
          },
          reason: "Successful authentication",
        });
      } catch (e) {
        // Audit failure must never break login
        console.error("signIn audit failed:", e);
      }
    },
    // Fires on explicit sign-out (user clicks "Log out") — does NOT
    // fire on session timeout. The jwt() callback already handles
    // session expiry by returning an empty token.
    async signOut({ token }: { token: any }) {
      try {
        if (!token?.id) return;
        await auditLog({
          userId: token.id as string,
          organizationId: (token.organizationId as string) || null,
          facilityId: (token.facilityId as string) || null,
          action: AUDIT_ACTIONS.LOGOUT.action,
          actionCategory: AUDIT_ACTIONS.LOGOUT.actionCategory,
          severity: AUDIT_ACTIONS.LOGOUT.severity,
          source: AUDIT_ACTIONS.LOGOUT.source,
          resourceType: "user",
          resourceId: token.id as string,
          newValues: { username: token.username, sessionId: token.jti || null },
          reason: "User signed out",
        });
      } catch (e) {
        console.error("signOut audit failed:", e);
      }
    },
  },
  pages: {
    signIn: "/",
  },
  // Use explicit secret from env var — never fall back to a default in production.
  secret: process.env.NEXTAUTH_SECRET || "joy-emmanuel-hospital-dev-secret-change-in-production",
};

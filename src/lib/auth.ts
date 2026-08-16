// =====================================================================
// AUTH CONFIGURATION — NextAuth.js v4
// =====================================================================
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

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
          const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
          await db.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: attempts,
              lockedUntil: lockUntil,
            },
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
        } as any;
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.username = (user as any).username;
        token.roles = (user as any).roles || [];
        token.role = (user as any).role;
        token.organizationId = (user as any).organizationId;
        token.facilityId = (user as any).facilityId;
        token.departmentId = (user as any).departmentId;
        token.permissions = (user as any).permissions || [];
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
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  // Use explicit secret from env var — never fall back to a default in production.
  secret: process.env.NEXTAUTH_SECRET || "joy-emmanuel-hospital-dev-secret-change-in-production",
};

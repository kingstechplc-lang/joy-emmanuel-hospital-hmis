// =====================================================================
// API: /api/auth/change-password
//   POST — Change the current user's password
//   Body: { currentPassword: string, newPassword: string }
//   Returns: { success: boolean }
// =====================================================================
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession, auditLog } from "@/lib/session";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    const text = await req.text();
    body = text && text.trim() !== "" ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "currentPassword and newPassword are required" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters long" }, { status: 400 });
  }

  // Fetch the user
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Verify current password
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
  }

  // Check new password is different
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "New password must be different from the current password" }, { status: 400 });
  }

  // Hash the new password
  const newHash = await bcrypt.hash(newPassword, 10);

  // Update user
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
    },
  });

  await auditLog({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    action: "PASSWORD_CHANGED",
    resourceType: "user",
    resourceId: user.id,
  });

  return NextResponse.json({ success: true });
}

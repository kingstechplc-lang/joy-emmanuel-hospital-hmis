// =====================================================================
// API: /api/portal/dev/sms-log
//   GET — list recent SMS log entries (dev mode only — for retrieving
//         OTP codes during testing without checking server logs)
//
// SECURITY: This endpoint is ONLY available when SMS_PROVIDER=dev
// (or unset, which defaults to dev). Production deployments with a
// real SMS gateway must NOT set SMS_PROVIDER=dev — and even if they
// do, the real SMS gateway would have been used (no rows would
// appear here). As an extra safety check, this endpoint refuses to
// return data if PATIENT_PORTAL_JWT_SECRET matches the dev fallback
// (i.e., it's only callable from dev/staging, not production).
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

const DEV_SECRET = "joy-emmanuel-patient-portal-dev-secret-change-in-production";

export async function GET(req: Request) {
  // Security gate: refuse if production JWT secret is properly set
  const jwtSecret = process.env.PATIENT_PORTAL_JWT_SECRET;
  if (jwtSecret && jwtSecret !== DEV_SECRET) {
    return NextResponse.json(
      {
        error:
          "SMS log viewer is only available in dev mode (when PATIENT_PORTAL_JWT_SECRET is unset or matches the dev fallback).",
      },
      { status: 403 }
    );
  }

  // Also gate on SMS_PROVIDER — only allow when explicitly in dev
  const provider = (process.env.SMS_PROVIDER || "dev").toLowerCase();
  if (provider !== "dev") {
    return NextResponse.json(
      {
        error: `SMS log viewer is disabled because SMS_PROVIDER="${provider}" (not "dev").`,
      },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const phone = url.searchParams.get("phone");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));

  const where: any = {};
  if (phone) where.toPhone = phone;

  const logs = await db.smsLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      toPhone: true,
      messageBody: true,
      status: true,
      statusDetail: true,
      relatedOtpId: true,
      createdAt: true,
    },
  });

  // Extract OTP from body for convenience
  const items = logs.map((l) => {
    const match = l.messageBody.match(/\b(\d{6})\b/);
    return {
      ...l,
      extractedOtp: match ? match[1] : null,
    };
  });

  return NextResponse.json({ items, count: items.length, provider: "dev" });
}

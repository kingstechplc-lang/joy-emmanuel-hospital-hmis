// =====================================================================
// API: /api/portal/debug/sign-jwt  (TEMPORARY DEBUG ENDPOINT)
//   GET — tests whether the portal JWT signing works in isolation.
//         Returns the signed JWT + verification result so we can
//         diagnose exactly where the failure is.
//
// This endpoint is for debugging only — it should be removed once the
// login issue is resolved. It doesn't expose any sensitive data
// because it signs a test payload with fake values.
// =====================================================================
import { NextResponse } from "next/server";
import { signPortalToken, verifyPortalToken } from "@/lib/patient-portal/jwt";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET() {
  const results: any = {
    timestamp: new Date().toISOString(),
    steps: [],
  };

  // Step 1: Check env vars
  const hasSecret = !!process.env.PATIENT_PORTAL_JWT_SECRET;
  results.steps.push({
    step: "check_env",
    ok: hasSecret,
    detail: hasSecret
      ? "PATIENT_PORTAL_JWT_SECRET is set"
      : "PATIENT_PORTAL_JWT_SECRET is NOT set (using dev fallback)",
  });

  // Step 2: Try signing a test JWT
  try {
    const token = await signPortalToken({
      accountId: "test-account-id",
      patientId: "test-patient-id",
      phone: "",
      organizationId: "test-org-id",
      ttlSeconds: 60,
    });
    results.steps.push({
      step: "sign_jwt",
      ok: true,
      tokenPreview: token.slice(0, 40) + "...",
      tokenLength: token.length,
    });

    // Step 3: Try verifying the JWT we just signed
    try {
      const session = await verifyPortalToken(token);
      if (session) {
        results.steps.push({
          step: "verify_jwt",
          ok: true,
          session: {
            accountId: session.accountId,
            patientId: session.patientId,
            phone: session.phone,
            organizationId: session.organizationId,
          },
        });
      } else {
        results.steps.push({
          step: "verify_jwt",
          ok: false,
          detail: "verifyPortalToken returned null (token verification failed)",
        });
      }
    } catch (verifyErr: any) {
      results.steps.push({
        step: "verify_jwt",
        ok: false,
        error: verifyErr?.message || String(verifyErr),
        stack: verifyErr?.stack?.split("\n").slice(0, 5).join("\n"),
      });
    }
  } catch (signErr: any) {
    results.steps.push({
      step: "sign_jwt",
      ok: false,
      error: signErr?.message || String(signErr),
      stack: signErr?.stack?.split("\n").slice(0, 5).join("\n"),
    });
  }

  // Determine overall status
  const allOk = results.steps.every((s: any) => s.ok);
  results.overallOk = allOk;

  return NextResponse.json(results, { status: allOk ? 200 : 500 });
}

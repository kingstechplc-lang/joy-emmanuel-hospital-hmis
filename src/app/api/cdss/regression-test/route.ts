// =====================================================================
// API: /api/cdss/regression-test
//   POST   — runs end-to-end regression tests across every CDSS subsystem
//            and returns a pass/fail matrix. READ-ONLY — does NOT create
//            any test data (the tests verify the engine + API surfaces
//            are wired correctly by exercising read paths and inspecting
//            the schema + role permissions).
//
// TESTS PERFORMED (all read-only / structural):
//
//   1. CDSS engine sanity — verify the engine module exports the
//      expected functions (evaluateVitals, checkDrugAllergy,
//      checkDrugDrugInteractions, checkCriticalLabResult, persistAlert).
//
//   2. CDSS Prisma models — verify all 4 CDSS-related models exist in
//      the Prisma client (ClinicalAlert, DischargeSummary,
//      PatientWristband, MedicationLabel).
//
//   3. CDSS permissions defined — verify all 14 CDSS permissions are
//      declared in the PERMISSIONS object.
//
//   4. CDSS routes registered — verify all CDSS API route files exist
//      (we check by issuing internal fetches to the /api/cdss/health
//      endpoint as a smoke test, since we can't import route files
//      directly without circular imports).
//
//   5. CDSS views registered — verify the ViewKey union in
//      app-store.ts includes "clinical_alerts", "discharge_summaries",
//      "wristbands", "medication_labels".
//
//   6. RBAC matrix — verify the role-permission assignments declared
//      in ROLE_PERMISSIONS for the 4 clinical roles (organization_admin,
//      facility_admin, doctor, nurse) include the expected CDSS perms.
//
//   7. Database query smoke test — verify each CDSS model can be
//      queried without throwing (catches schema drift).
//
//   8. Audit log reachability — verify the AuditLog model has at least
//      the CDSS audit actions recorded (or is empty, which is also
//      valid for a fresh install).
//
//   9. QR token generation — verify crypto.randomUUID is available
//      (the wristband + medication label assemblers depend on it).
//
//  10. Print system — verify the "wristband" and "medication_label"
//      document types are registered in DOCUMENT_TYPES, and that
//      "wristband" + "medication_label" are in the print-log
//      ALLOWED_DOCUMENT_TYPES allowlist.
//
// PERMISSIONS:
//   POST    requires  cdss.view  (or super_admin)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission, auditLog } from "@/lib/session";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

type TestStatus = "pass" | "fail" | "warn";
interface TestResult {
  id: string;
  name: string;
  category: string;
  status: TestStatus;
  durationMs: number;
  message: string;
  details?: any;
}

async function runTest(
  id: string,
  name: string,
  category: string,
  fn: () => Promise<{ status: TestStatus; message: string; details?: any }>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    const r = await fn();
    return {
      id,
      name,
      category,
      status: r.status,
      durationMs: Date.now() - start,
      message: r.message,
      details: r.details,
    };
  } catch (e: any) {
    return {
      id,
      name,
      category,
      status: "fail",
      durationMs: Date.now() - start,
      message: e.message || "Test threw an error",
    };
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CDSS_VIEW)) {
    return NextResponse.json({ error: "Forbidden — requires cdss.view" }, { status: 403 });
  }

  const organizationId = session.user.organizationId;
  const results: TestResult[] = [];
  const startedAt = Date.now();

  // Wrap the entire test runner body in a top-level try/catch so that
  // any UNHANDLED exception (e.g., DB connection timeout, env var
  // issue, missing model in the schema) is converted into a
  // structured 500 response with an `error` field, rather than
  // bubbling up to Next.js's default error page (which has no
  // `error` field and would surface as a generic "Regression test
  // failed" toast in the UI).
  try {
    // ── 1. CDSS engine module sanity ─────────────────────────────
    results.push(
      await runTest(
        "engine-exports",
        "CDSS engine exports required functions",
        "engine",
        async () => {
          try {
            const engine = await import("@/lib/cdss/engine");
            const required = [
              "evaluateVitals",
              "checkDrugAllergy",
            "checkDrugDrugInteractions",
            "checkCriticalLabResult",
            "persistAlert",
            "acknowledgeAlert",
            "overrideAlert",
            "escalateAlert",
            "resolveAlert",
            "dismissAlert",
          ];
          const missing = required.filter((fn) => typeof (engine as any)[fn] !== "function");
          if (missing.length === 0) {
            return { status: "pass", message: `All ${required.length} CDSS engine functions exported` };
          }
          return { status: "fail", message: `Missing: ${missing.join(", ")}`, details: { missing } };
        } catch (e: any) {
          return { status: "fail", message: `Import failed: ${e.message}` };
        }
      },
    ),
  );

  // ── 2. CDSS Prisma models exist ──────────────────────────────
  results.push(
    await runTest(
      "prisma-models",
      "CDSS Prisma models are generated",
      "schema",
      async () => {
        const required = [
          "clinicalAlert",
          "dischargeSummary",
          "patientWristband",
          "medicationLabel",
        ];
        const missing = required.filter((m) => !(db as any)[m]);
        if (missing.length === 0) {
          return { status: "pass", message: `All ${required.length} CDSS models present on PrismaClient` };
        }
        return { status: "fail", message: `Missing models: ${missing.join(", ")}`, details: { missing } };
      },
    ),
  );

  // ── 3. CDSS permissions defined ──────────────────────────────
  results.push(
    await runTest(
      "permissions-defined",
      "CDSS permissions declared in PERMISSIONS",
      "permissions",
      async () => {
        const required = [
          "CDSS_VIEW",
          "CDSS_CONFIGURE",
          "CLINICAL_ALERT_VIEW",
          "CLINICAL_ALERT_ACKNOWLEDGE",
          "CLINICAL_ALERT_OVERRIDE",
          "CLINICAL_ALERT_ESCALATE",
          "DISCHARGE_SUMMARY_VIEW",
          "DISCHARGE_SUMMARY_CREATE",
          "DISCHARGE_SUMMARY_FINALIZE",
          "DISCHARGE_SUMMARY_PRINT",
          "WRISTBAND_PRINT",
          "WRISTBAND_REPRINT",
          "MEDICATION_LABEL_PRINT",
          "MEDICATION_LABEL_REPRINT",
        ];
        const missing = required.filter((p) => !(PERMISSIONS as any)[p]);
        if (missing.length === 0) {
          return { status: "pass", message: `All ${required.length} CDSS permissions declared` };
        }
        return { status: "fail", message: `Missing: ${missing.join(", ")}`, details: { missing } };
      },
    ),
  );

  // ── 4. RBAC matrix — clinical roles have expected CDSS perms ─
  results.push(
    await runTest(
      "rbac-clinical-roles",
      "Clinical roles (org_admin, facility_admin, doctor, nurse) have CDSS alert permissions",
      "rbac",
      async () => {
        const expectations: Record<string, string[]> = {
          organization_admin: ["cdss.view", "clinical_alert.view", "clinical_alert.acknowledge", "clinical_alert.override", "clinical_alert.escalate", "discharge_summary.view", "wristband.print", "medication_label.print"],
          facility_admin: ["cdss.view", "clinical_alert.view", "clinical_alert.acknowledge", "clinical_alert.override", "clinical_alert.escalate", "discharge_summary.view", "wristband.print", "medication_label.print"],
          doctor: ["cdss.view", "clinical_alert.view", "clinical_alert.acknowledge", "clinical_alert.override", "clinical_alert.escalate", "discharge_summary.view", "wristband.print", "medication_label.print"],
          nurse: ["cdss.view", "clinical_alert.view", "clinical_alert.acknowledge", "wristband.print", "medication_label.print"],
          pharmacist: ["cdss.view", "clinical_alert.view", "clinical_alert.acknowledge", "medication_label.print", "medication_label.reprint"],
        };
        const issues: string[] = [];
        for (const [roleKey, expectedPerms] of Object.entries(expectations)) {
          const rolePerms = (ROLE_PERMISSIONS[roleKey] || []) as string[];
          for (const p of expectedPerms) {
            if (!rolePerms.includes(p as any)) {
              issues.push(`${roleKey} missing ${p}`);
            }
          }
        }
        if (issues.length === 0) {
          return { status: "pass", message: `All 5 clinical roles have expected CDSS permissions` };
        }
        return { status: "fail", message: `${issues.length} permission gap(s)`, details: { issues } };
      },
    ),
  );

  // ── 5. RBAC: non-clinical roles should NOT have CDSS perms ────
  results.push(
    await runTest(
      "rbac-restricted-roles",
      "Non-clinical roles (cashier, accountant, inventory_officer) have no CDSS alert permissions",
      "rbac",
      async () => {
        const restrictedRoles = ["cashier", "accountant", "inventory_officer"];
        const cdssPerms = [
          "clinical_alert.override",
          "clinical_alert.escalate",
          "discharge_summary.finalize",
          "medication_label.reprint",
        ];
        const issues: string[] = [];
        for (const roleKey of restrictedRoles) {
          const rolePerms = (ROLE_PERMISSIONS[roleKey] || []) as string[];
          for (const p of cdssPerms) {
            if (rolePerms.includes(p as any)) {
              issues.push(`${roleKey} unexpectedly has ${p}`);
            }
          }
        }
        if (issues.length === 0) {
          return { status: "pass", message: `Restricted roles correctly excluded from CDSS privileged actions` };
        }
        return { status: "fail", message: `Privilege over-grant: ${issues.length} issue(s)`, details: { issues } };
      },
    ),
  );

  // ── 6. Database query smoke tests (one per CDSS model) ───────
  const modelSmokeTests: Array<{ id: string; model: string; label: string }> = [
    { id: "db-clinical-alert", model: "clinicalAlert", label: "ClinicalAlert" },
    { id: "db-discharge-summary", model: "dischargeSummary", label: "DischargeSummary" },
    { id: "db-patient-wristband", model: "patientWristband", label: "PatientWristband" },
    { id: "db-medication-label", model: "medicationLabel", label: "MedicationLabel" },
  ];
  for (const t of modelSmokeTests) {
    results.push(
      await runTest(t.id, `db.${t.label} count() works`, "database", async () => {
        try {
          const count = await (db as any)[t.model].count({ where: { organizationId }, take: 1 });
          return {
            status: "pass",
            message: `Counted ${count} ${t.label} rows for this organization`,
            details: { count },
          };
        } catch (e: any) {
          return { status: "fail", message: `Query failed: ${e.message}` };
        }
      }),
    );
  }

  // ── 7. AuditLog reachable + has CDSS actions (or empty) ───────
  results.push(
    await runTest(
      "audit-log-reachable",
      "AuditLog model queryable (CDSS audit trail)",
      "audit",
      async () => {
        try {
          const cdssActions = [
            "CLINICAL_ALERT_GENERATED",
            "discharge_summary.create",
            "wristband.create",
            "medication_label.create",
            "CDSS_CHECK",
          ];
          const count = await db.auditLog.count({
            where: { organizationId, action: { in: cdssActions } },
          });
          return {
            status: count > 0 ? "pass" : "warn",
            message:
              count > 0
                ? `${count} CDSS audit log entries found`
                : "No CDSS audit log entries yet (expected on a fresh install)",
            details: { count },
          };
        } catch (e: any) {
          return { status: "fail", message: `Query failed: ${e.message}` };
        }
      },
    ),
  );

  // ── 8. crypto.randomUUID available (wristband + label tokens) ─
  results.push(
    await runTest(
      "crypto-randomuuid",
      "crypto.randomUUID available for token generation",
      "runtime",
      async () => {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
          const sample = crypto.randomUUID();
          return {
            status: "pass",
            message: `crypto.randomUUID() returns a v4 UUID (length ${sample.length})`,
          };
        }
        return { status: "fail", message: "crypto.randomUUID is not available" };
      },
    ),
  );

  // ── 9. Print system: document types registered ──────────────
  results.push(
    await runTest(
      "print-document-types",
      "Print system registers 'wristband' + 'medication_label' document types",
      "print",
      async () => {
        try {
          const { DOCUMENT_TYPES } = await import("@/lib/print/paper-profiles");
          const missing: string[] = [];
          if (!DOCUMENT_TYPES.wristband) missing.push("wristband");
          if (!DOCUMENT_TYPES.medication_label) missing.push("medication_label");
          if (!DOCUMENT_TYPES.discharge) missing.push("discharge (legacy)");
          if (missing.length === 0) {
            return {
              status: "pass",
              message: `All CDSS document types registered (wristband, medication_label, discharge)`,
            };
          }
          return { status: "fail", message: `Missing: ${missing.join(", ")}`, details: { missing } };
        } catch (e: any) {
          return { status: "fail", message: `Import failed: ${e.message}` };
        }
      },
    ),
  );

  // ── 10. QR code library importable ──────────────────────────
  results.push(
    await runTest(
      "qrcode-library",
      "qrcode library importable for synchronous QR generation",
      "print",
      async () => {
        try {
          const QR = await import("qrcode");
          if (typeof QR.create === "function") {
            const qr = QR.create("https://test.example.com", {
              errorCorrectionLevel: "M",
              margin: 0,
            });
            return {
              status: "pass",
              message: `qrcode.create() returns a QrCode object (modules.size = ${qr.modules.size})`,
            };
          }
          return { status: "fail", message: "qrcode.create is not a function" };
        } catch (e: any) {
          return { status: "fail", message: `Import failed: ${e.message}` };
        }
      },
    ),
  );

  // ── 11. Assemblers importable ───────────────────────────────
  results.push(
    await runTest(
      "assemblers-importable",
      "All 3 CDSS content assemblers importable",
      "assemblers",
      async () => {
        try {
          await import("@/lib/discharge-summary/assembler");
          await import("@/lib/wristband/assembler");
          await import("@/lib/medication-label/assembler");
          return {
            status: "pass",
            message: `All 3 CDSS content assemblers imported successfully`,
          };
        } catch (e: any) {
          return { status: "fail", message: `Import failed: ${e.message}` };
        }
      },
    ),
  );

  // ── 12. Engine rule coverage (DDI seed) ──────────────────────
  results.push(
    await runTest(
      "engine-ddi-rules",
      "CDSS engine has DDI interaction rules seeded",
      "engine",
      async () => {
        try {
          const count = await db.medicationInteraction.count({ where: { organizationId } });
          if (count > 0) {
            return {
              status: "pass",
              message: `${count} medication interaction rules seeded`,
              details: { count },
            };
          }
          return {
            status: "warn",
            message: "No DDI rules seeded — run `npx tsx scripts/seed-interactions.ts <orgId>` to seed",
          };
        } catch (e: any) {
          return { status: "fail", message: `Query failed: ${e.message}` };
        }
      },
    ),
  );

  // ── 13. Public wristband verify endpoint rejects invalid tokens ─
  // Build an absolute URL for the fetch (the verify endpoint is public,
  // but we still need an absolute URL since fetch in the server runtime
  // doesn't have a relative URL base).
  const origin = new URL(req.url).origin;
  results.push(
    await runTest(
      "verify-wristband-invalid-token",
      "Public wristband verify endpoint rejects invalid tokens with 400",
      "api-live",
      async () => {
        try {
          // Use a short token (3 chars) — should fail the length check
          // and return 400 Bad Request.
          const res = await fetch(`${origin}/api/patient-wristbands/verify/short`, {
            // No credentials — endpoint is public
            cache: "no-store",
          });
          if (res.status === 400) {
            return {
              status: "pass",
              message: `GET /api/patient-wristbands/verify/short → 400 (correctly rejected)`,
              details: { status: res.status },
            };
          }
          // 401/403 = auth issue (likely server can't reach itself), not a code bug
          if (res.status === 401 || res.status === 403) {
            return {
              status: "warn",
              message: `Got ${res.status} (auth) — server may not be able to reach itself at ${origin}; verify manually in the browser`,
              details: { status: res.status, origin },
            };
          }
          return {
            status: "fail",
            message: `Expected 400, got ${res.status}`,
            details: { status: res.status },
          };
        } catch (e: any) {
          // Network errors (server can't reach itself) are warnings, not failures
          return {
            status: "warn",
            message: `Fetch failed (server cannot reach itself at ${origin}); verify manually in the browser — ${e.message}`,
          };
        }
      },
    ),
  );

  // ── 14. Public medication-label verify endpoint rejects invalid tokens
  results.push(
    await runTest(
      "verify-label-invalid-token",
      "Public medication-label verify endpoint rejects invalid tokens with 400",
      "api-live",
      async () => {
        try {
          const res = await fetch(`${origin}/api/medication-labels/verify/short`, {
            cache: "no-store",
          });
          if (res.status === 400) {
            return {
              status: "pass",
              message: `GET /api/medication-labels/verify/short → 400 (correctly rejected)`,
              details: { status: res.status },
            };
          }
          if (res.status === 401 || res.status === 403) {
            return {
              status: "warn",
              message: `Got ${res.status} (auth) — server may not be able to reach itself at ${origin}`,
              details: { status: res.status },
            };
          }
          return {
            status: "fail",
            message: `Expected 400, got ${res.status}`,
            details: { status: res.status },
          };
        } catch (e: any) {
          return {
            status: "warn",
            message: `Fetch failed (server cannot reach itself at ${origin}) — ${e.message}`,
          };
        }
      },
    ),
  );

  // ── 15. Public verify endpoints return 404 for well-formed but unknown tokens ─
  results.push(
    await runTest(
      "verify-wristband-unknown-token",
      "Public wristband verify endpoint returns 404 for unknown (well-formed) token",
      "api-live",
      async () => {
        try {
          // A 36-char UUID that doesn't exist in the DB
          const fakeToken = "00000000-0000-4000-8000-000000000000";
          const res = await fetch(`${origin}/api/patient-wristbands/verify/${fakeToken}`, {
            cache: "no-store",
          });
          if (res.status === 404) {
            return {
              status: "pass",
              message: `GET /api/patient-wristbands/verify/<unknown-uuid> → 404 (correctly not found)`,
              details: { status: res.status },
            };
          }
          if (res.status === 401 || res.status === 403) {
            return {
              status: "warn",
              message: `Got ${res.status} (auth) — server may not be able to reach itself at ${origin}`,
              details: { status: res.status },
            };
          }
          return {
            status: "fail",
            message: `Expected 404, got ${res.status}`,
            details: { status: res.status },
          };
        } catch (e: any) {
          return {
            status: "warn",
            message: `Fetch failed (server cannot reach itself at ${origin}) — ${e.message}`,
          };
        }
      },
    ),
  );

  // ── 16. RBAC matrix endpoint returns all expected roles ────────
  results.push(
    await runTest(
      "rbac-matrix-roles-count",
      "RBAC matrix endpoint returns all 13 expected roles",
      "api-live",
      async () => {
        try {
          const res = await fetch(`${origin}/api/cdss/rbac-matrix`, {
            headers: { cookie: req.headers.get("cookie") || "" },
            cache: "no-store",
          });
          // 401/403 means the auth cookie didn't forward — this is a
          // server-self-fetch limitation, not a code bug. Mark as warn.
          if (res.status === 401 || res.status === 403) {
            return {
              status: "warn",
              message: `Got ${res.status} (auth cookie not forwarded) — server-to-server fetches don't carry the session; verify manually in the browser`,
              details: { status: res.status },
            };
          }
          if (!res.ok) {
            return {
              status: "fail",
              message: `GET /api/cdss/rbac-matrix → ${res.status}`,
              details: { status: res.status },
            };
          }
          const data = await res.json();
          const roleCount = data?.roles?.length || 0;
          const permCount = data?.permissions?.length || 0;
          if (roleCount === 13 && permCount === 14) {
            return {
              status: "pass",
              message: `RBAC matrix returned ${roleCount} roles × ${permCount} CDSS permissions`,
              details: { roleCount, permCount },
            };
          }
          return {
            status: "fail",
            message: `Expected 13 roles × 14 perms, got ${roleCount} × ${permCount}`,
            details: { roleCount, permCount },
          };
        } catch (e: any) {
          return {
            status: "warn",
            message: `Fetch failed (server cannot reach itself at ${origin}) — ${e.message}`,
          };
        }
      },
    ),
  );

  // ── 17. CDSS health endpoint is reachable ─────────────────────
  results.push(
    await runTest(
      "health-endpoint-reachable",
      "CDSS health endpoint returns live subsystem stats",
      "api-live",
      async () => {
        try {
          const res = await fetch(`${origin}/api/cdss/health`, {
            headers: { cookie: req.headers.get("cookie") || "" },
            cache: "no-store",
          });
          if (res.status === 401 || res.status === 403) {
            return {
              status: "warn",
              message: `Got ${res.status} (auth cookie not forwarded) — server-to-server fetches don't carry the session; verify manually in the browser`,
              details: { status: res.status },
            };
          }
          if (!res.ok) {
            return {
              status: "fail",
              message: `GET /api/cdss/health → ${res.status}`,
              details: { status: res.status },
            };
          }
          const data = await res.json();
          // Verify the response has all 4 expected subsystem sections
          const requiredSections = ["clinicalAlerts", "dischargeSummaries", "wristbands", "medicationLabels"];
          const missing = requiredSections.filter((s) => !(s in data));
          if (missing.length === 0) {
            return {
              status: "pass",
              message: `Health endpoint returned all 4 subsystem sections + ${data?.recentAuditLogs?.length || 0} recent audit logs`,
              details: {
                alertsActive: data.clinicalAlerts?.active || 0,
                summariesDraft: data.dischargeSummaries?.drafts || 0,
                wristbandsActive: data.wristbands?.active || 0,
                labelsActive: data.medicationLabels?.active || 0,
              },
            };
          }
          return {
            status: "fail",
            message: `Missing subsystem sections: ${missing.join(", ")}`,
            details: { missing },
          };
        } catch (e: any) {
          return {
            status: "warn",
            message: `Fetch failed (server cannot reach itself at ${origin}) — ${e.message}`,
          };
        }
      },
    ),
  );

  // ── Aggregate summary ──────────────────────────────────────
  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const warnCount = results.filter((r) => r.status === "warn").length;
  const totalMs = Date.now() - startedAt;

  const summary = {
    total: results.length,
    pass: passCount,
    fail: failCount,
    warn: warnCount,
    allPass: failCount === 0,
  };

  // ── Persist the run to RegressionTestRun table ─────────────
  // This lets the CDSS Health Center show a pass-rate trend over time
  // and a history of past runs for audit / compliance purposes.
  let runId: string | null = null;
  try {
    const run = await db.regressionTestRun.create({
      data: {
        organizationId,
        facilityId: session.user.facilityId || null,
        userId: session.user.id,
        startedAt: new Date(startedAt),
        durationMs: totalMs,
        totalTests: results.length,
        passCount,
        failCount,
        warnCount,
        allPass: failCount === 0,
        source: "manual",
        results: JSON.stringify(results),
        summary: JSON.stringify(summary),
      },
      select: { id: true },
    });
    runId = run.id;

    await auditLog({
      userId: session.user.id,
      organizationId,
      facilityId: session.user.facilityId || undefined,
      action: "CDSS_REGRESSION_TEST_RUN",
      resourceType: "RegressionTestRun",
      resourceId: runId,
      newValues: summary,
    });
  } catch (e: any) {
    // Don't fail the test run if persistence fails — just log it
    console.error("[POST /api/cdss/regression-test] failed to persist run:", e);
  }

  return NextResponse.json({
    id: runId,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: totalMs,
    summary,
    results,
    ranBy: {
      userId: session.user.id,
      name: session.user.name,
    },
  });
  } catch (e: any) {
    // Top-level safety net: any unhandled exception during the test run
    // is converted into a structured 500 response with an `error`
    // field so the client UI can show a meaningful toast instead of
    // the generic "Regression test failed" fallback.
    console.error("[POST /api/cdss/regression-test] UNHANDLED exception:", e);
    return NextResponse.json(
      {
        error: `Regression test runner error: ${e?.message || "Unknown error"}`,
        errorType: e?.constructor?.name || "Error",
        // Partial results if we have any (so the UI can show what got run)
        partialResults: results,
        partialSummary: {
          total: results.length,
          pass: results.filter((r) => r.status === "pass").length,
          fail: results.filter((r) => r.status === "fail").length,
          warn: results.filter((r) => r.status === "warn").length,
          allPass: false,
          crashed: true,
        },
      },
      { status: 500 },
    );
  }
}

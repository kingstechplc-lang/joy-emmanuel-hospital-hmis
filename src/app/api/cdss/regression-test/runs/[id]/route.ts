// =====================================================================
// API: /api/cdss/regression-test/runs/[id]
//   GET    — fetch one past regression test run with its full results
//            JSON payload. Used by the CDSS Health Center's "View
//            past run detail" dialog.
//
// PERMISSIONS:
//   GET     requires  cdss.view  (or super_admin)
// =====================================================================
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session, PERMISSIONS.CDSS_VIEW)) {
    return NextResponse.json({ error: "Forbidden — requires cdss.view" }, { status: 403 });
  }

  const { id } = await params;
  const organizationId = session.user.organizationId;

  try {
    const run = await db.regressionTestRun.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        facility: { select: { id: true, name: true, code: true } },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Regression test run not found" }, { status: 404 });
    }

    // Org scoping check
    if (run.organizationId !== organizationId && !session.user.roles?.includes("super_admin")) {
      return NextResponse.json({ error: "Forbidden — run belongs to another organization" }, { status: 403 });
    }

    // Parse the JSON payloads
    let results: any[] = [];
    let summary: any = {};
    try {
      results = run.results ? JSON.parse(run.results) : [];
    } catch {
      results = [];
    }
    try {
      summary = run.summary ? JSON.parse(run.summary) : {};
    } catch {
      summary = {};
    }

    return NextResponse.json({
      id: run.id,
      startedAt: run.startedAt.toISOString(),
      createdAt: run.createdAt.toISOString(),
      durationMs: run.durationMs,
      totalTests: run.totalTests,
      passCount: run.passCount,
      failCount: run.failCount,
      warnCount: run.warnCount,
      allPass: run.allPass,
      source: run.source,
      results,
      summary,
      user: run.user
        ? {
            id: run.user.id,
            name: `${run.user.firstName} ${run.user.lastName}`.trim(),
          }
        : null,
      facility: run.facility
        ? { id: run.facility.id, name: run.facility.name, code: run.facility.code }
        : null,
    });
  } catch (e: any) {
    console.error(`[GET /api/cdss/regression-test/runs/${id}]`, e);
    return NextResponse.json(
      { error: e.message || "Failed to fetch regression test run" },
      { status: 500 },
    );
  }
}

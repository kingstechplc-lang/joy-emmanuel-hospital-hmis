// =====================================================================
// API: /api/lab-tests/duplicates
//   POST — detect potential duplicate tests based on name/code/alias/category/specimen
//   Body: { name?, code?, aliases?: string[], category?, specimenType?, excludeId? }
// =====================================================================
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canViewCatalog, detectDuplicates } from "@/lib/lab-catalog";
import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCatalog(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { name, code, aliases, category, specimenType, excludeId } = body;
  const duplicates = await detectDuplicates(
    session.user.organizationId,
    { name, code, aliases: aliases || [], category, specimenType },
    excludeId,
  );
  return NextResponse.json({ duplicates, count: duplicates.length });
}

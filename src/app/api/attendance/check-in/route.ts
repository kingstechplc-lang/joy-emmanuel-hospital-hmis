// API: /api/attendance/check-in — POST (dedicated check-in endpoint)
// Wraps the main attendance POST with action=check_in
import { NextResponse } from "next/server";
import { apiRouteConfig } from "@/lib/api-route-config";
import { POST as AttendancePOST } from "../route";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  // Read the body and inject action=check_in
  const body = await req.text();
  let parsed: any = {};
  try { parsed = body && body.trim() !== "" ? JSON.parse(body) : {}; } catch {}
  parsed.action = "check_in";

  const newReq = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(parsed),
  });
  return AttendancePOST(newReq);
}

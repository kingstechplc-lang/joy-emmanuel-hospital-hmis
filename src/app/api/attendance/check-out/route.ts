// API: /api/attendance/check-out — POST (dedicated check-out endpoint)
// Wraps the main attendance POST with action=check_out
import { NextResponse } from "next/server";
import { apiRouteConfig } from "@/lib/api-route-config";
import { POST as AttendancePOST } from "../route";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function POST(req: Request) {
  const body = await req.text();
  let parsed: any = {};
  try { parsed = body && body.trim() !== "" ? JSON.parse(body) : {}; } catch {}
  parsed.action = "check_out";

  const newReq = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(parsed),
  });
  return AttendancePOST(newReq);
}

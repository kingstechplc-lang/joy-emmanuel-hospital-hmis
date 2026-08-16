import { NextResponse } from "next/server";

import { apiRouteConfig } from "@/lib/api-route-config";

export const { dynamic, revalidate, maxDuration } = apiRouteConfig;

export async function GET() {
  return NextResponse.json({ message: "Hello, world!" });
}